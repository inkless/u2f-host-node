import { pseudoRandomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { Device, HID } from 'node-hid';
import Deferred from './defer';

const U2FHID_PING = 0x80 | 0x01;
const U2FHID_MSG = 0x80 | 0x03;
// const U2FHID_LOCK = 0x80 | 0x04;
const U2FHID_INIT = 0x80 | 0x06;
const U2FHID_WINK = 0x80 | 0x08;
// const U2FHID_SYNC = 0x80 | 0x3c;
const U2FHID_ERROR = 0x80 | 0x3f;
// const U2FHID_VENDOR_FIRST = 0x80 | 0x40;
// const U2FHID_VENDOR_LAST = 0x80 | 0x7f;
const U2FHID_BROADCAST_CID = 0xffffffff;

const REPORT_SIZE = 64;

const HID_ERRORS: { [key: number]: string } = {
  0x00: 'No error',
  0x01: 'Invalid command',
  0x02: 'Invalid parameter',
  0x03: 'Invalid message length',
  0x04: 'Invalid message sequencing',
  0x05: 'Message has timed out',
  0x06: 'Channel busy',
  0x0a: 'Command requires channel lock',
  0x0b: 'SYNC command failed',
  0x7f: 'Other unspecified error',
};

interface ITransaction {
  command: number;
  data: Buffer;
  toReceive: number;
  receivedBytes: number;
  receivedBufs: Buffer[];
  deferred: Deferred<Buffer>;
}

// FIDO U2F HID Protocol Specification
// https://fidoalliance.org/specs/fido-u2f-v1.2-ps-20170411/fido-u2f-hid-protocol-v1.2-ps-20170411.html
export class U2FHIDDevice extends EventEmitter {
  public static async open(device: Device) {
    const u2fHid = new U2FHIDDevice(device);
    return await u2fHid.init();
  }

  public protocolVersion = 0;
  public deviceVersion = [0, 0, 0];
  public caps: { wink?: boolean } = {};
  public closed = false;
  public device: HID;

  private _channelId = U2FHID_BROADCAST_CID;
  private _packetBuf = Buffer.alloc(REPORT_SIZE);
  private _transactionQueue: ITransaction[] = [];
  private _curTransaction: ITransaction | undefined;

  constructor(deviceInfo: Device) {
    super();

    if (!deviceInfo.path) {
      throw new Error('Device path does not exist');
    }

    this.device = new HID(deviceInfo.path);
    this.device.on('error', this._onError);
    this.device.on('data', this._onData);
  }

  public async init(forSure = false): Promise<this> {
    const nonce = pseudoRandomBytes(8);

    const data = await this.command(U2FHID_INIT, nonce);
    // check nonce
    const respNonce = data.slice(0, 8);
    if (nonce.toString('hex') !== respNonce.toString('hex')) {
      throw new Error('Error initializing U2F HID Device: incorrect nonce');
    }

    // Decode other initialization data.
    // try {
    this._channelId = data.readUInt32BE(8);
    this.protocolVersion = data.readUInt8(12);
    this.deviceVersion = [data.readUInt8(13), data.readUInt8(14), data.readUInt8(15)];
    this.caps = {
      wink: !!(data.readUInt8(16) & 0x01),
    };
    // } catch (e) {
    //   throw new Error('Error initializing U2F HID device: returned initialization data too short.');
    // }

    // Check protocol version is compatible.
    if (this.protocolVersion !== 2) {
      throw new Error(
        `Error initializing U2F HID device: incompatible protocol version: ${this.protocolVersion}`,
      );
    }

    if (this._channelId >>> 24 === 0 && !forSure) {
      // Some buggy keys give unacceptable channel_ids the first
      // time (which don't work for following commands), so we try again.
      this._channelId = U2FHID_BROADCAST_CID;
      return await this.init(true);
    } else {
      return this;
    } // Successful initialization.
  }

  public command(command: number, data = Buffer.alloc(0)): Promise<Buffer> {
    if (this.closed) {
      throw new Error('Sending command to a closed device');
    }

    const deferred = new Deferred<Buffer>();
    this._transactionQueue.push({
      command,
      data,
      toReceive: 0xffff,
      receivedBytes: 0,
      receivedBufs: [],
      deferred,
    });

    if (!this._curTransaction) {
      this._executeNextTransaction();
    }

    return deferred.promise;
  }

  public close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this._curTransaction = undefined;
    this._transactionQueue = [];

    this.device.close();
    this.emit('closed');
  }

  public async ping(data: Buffer) {
    return await this.command(U2FHID_PING, data);
  }

  public async wink() {
    if (this.caps.wink) {
      return await this.command(U2FHID_WINK);
    }
  }

  public async msg(data: Buffer) {
    return await this.command(U2FHID_MSG, data);
  }

  private _onError = () => {
    this.close();
    this.emit('disconnected');
  }

  private _onData = (buf: Buffer) => {
    // Ignore packets outside the transaction.
    if (!this._curTransaction) {
      return;
    }

    // Decode packet
    const channelId = buf.readUInt32BE(0);
    // Ignore packet addressed to other channels.
    if (channelId !== this._channelId) {
      return;
    }

    const cmd = buf.readUInt8(4);
    if (cmd === U2FHID_ERROR) {
      // Errored.
      const errCode = buf.readUInt8(7);
      const error = new Error(HID_ERRORS[errCode] || HID_ERRORS[0x7f]);
      (error as any).code = errCode;
      this._curTransaction.deferred.reject(error);
      return this._executeNextTransaction();
    } else if (cmd & 0x80) {
      // console.log('xx', cmd, buf)
      // Initial packet
      if (cmd !== this._curTransaction.command) {
        return console.error( // tslint:disable-line
          'Transaction decoding failure: response is for different operation: ',
          cmd,
          this._curTransaction,
        );
      }

      this._curTransaction.toReceive = buf.readUInt16BE(5);
      this._curTransaction.receivedBufs[0] = buf.slice(7);
      this._curTransaction.receivedBytes += this._curTransaction.receivedBufs[0].length;
    } else {
      // Continuation packet.
      this._curTransaction.receivedBufs[cmd + 1] = buf.slice(5);
      this._curTransaction.receivedBytes += this._curTransaction.receivedBufs[cmd + 1].length;
    }

    // Call callback and finish transaction if read fully.
    // console.log('receviedBytes, toReceive', t.receivedBytes, t.toReceive)
    if (this._curTransaction.receivedBytes >= this._curTransaction.toReceive) {
      // console.log('receivedBufs', t.receivedBufs)
      this._curTransaction.deferred.resolve(
        Buffer.concat(this._curTransaction.receivedBufs).slice(0, this._curTransaction.toReceive),
      );

      this._executeNextTransaction();
    }
  }

  private _executeNextTransaction() {
    this._curTransaction = this._transactionQueue.shift();
    if (!this._curTransaction) {
      return;
    }

    try {
      this._sendCommand(this._curTransaction.command, this._curTransaction.data);
    } catch (e) {
      // Can be either incorrect command/data, or the device is failed/disconnected ("Cannot write to HID device").
      // In the latter case, an 'error' event will be emitted soon.
      // TODO: We're probably in an inconsistent state now. Maybe we need to U2FHID_SYNC.
      this._curTransaction.deferred.reject(e);
      this._executeNextTransaction(); // Process next one.
    }
  }

  private _sendCommand(command: number, data = Buffer.alloc(0)) {
    if (!(0x80 <= command && command < 0x100)) {
      throw new Error('Tried to send incorrect U2F HID command: ' + command);
    }

    // Create & send initial packet.
    const buf = this._packetBuf;
    buf.fill(0);
    buf.writeUInt32BE(this._channelId, 0);
    buf.writeUInt8(command, 4);
    buf.writeUInt16BE(data.length, 5);
    data.copy(buf, 7);
    data = data.slice(buf.length - 7);

    const initData = Array.from(buf);
    initData.unshift(0);

    this.device.write(initData);

    // Create & send continuation packets.
    let seq = 0;
    while (data.length > 0 && seq < 0x80) {
      buf.fill(0);
      buf.writeUInt32BE(this._channelId, 0);
      buf.writeUInt8(seq++, 4);
      data.copy(buf, 5);
      data = data.slice(buf.length - 5);

      const continueData = Array.from(buf);
      continueData.unshift(0);

      this.device.write(continueData);
    }

    if (data.length > 0) {
      throw new Error(
        `Tried to send too large data packet to U2F HID device (${data.length} bytes didn't fit).`,
      );
    }
  }
}
