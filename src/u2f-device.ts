import { EventEmitter } from 'events';
import Deferred from './defer';
import { U2FHIDDevice } from './u2f-hid-device';
import { hash, invert, toWebsafeBase64 } from './util';

// Raw U2F commands
const U2F_REGISTER = 0x01; // Registration command
const U2F_AUTHENTICATE = 0x02; // Authenticate/sign command
const U2F_VERSION = 0x03; // Read version string command
// const U2F_VENDOR_FIRST = 0xc0;
// const U2F_VENDOR_LAST = 0xff;
const U2F_AUTH_ENFORCE = 0x03; // Enforce user presence and sign
const U2F_AUTH_CHECK_ONLY = 0x07; // Check only

const U2F_CLIENT_DATA_TYP_REGISTER = 'navigator.id.finishEnrollment';
const U2F_CLIENT_DATA_TYP_AUTHENTICATE = 'navigator.id.getAssertion';

const ERROR_CODES = {
  SW_NO_ERROR: 0x9000,
  SW_WRONG_LENGTH: 0x6700,
  SW_CONDITIONS_NOT_SATISFIED: 0x6985,
  SW_WRONG_DATA: 0x6a80,
  SW_INS_NOT_SUPPORTED: 0x6d00,
};

const INVERT_ERROR_CODES = invert(ERROR_CODES);

export interface IU2FRegisterRequest {
  appId: string;
  challenge: string;
  version: string;
}

export interface IU2FRegisterResponse extends IU2FRegisterRequest {
  registrationData: string;
  clientData: string;
}

export interface IU2FAuthenticateRequest extends IU2FRegisterRequest {
  keyHandle: string;
}

export interface IU2FAuthenticateResponse extends IU2FAuthenticateRequest {
  signatureData: string;
  clientData: string;
}

// U2F Device raw interface.
// https://fidoalliance.org/specs/fido-u2f-v1.2-ps-20170411/fido-u2f-raw-message-formats-v1.2-ps-20170411.html
export class U2FDevice extends EventEmitter {
  public interactionTimeout = 30 * 1000;
  public interactionPollInterval = 200;

  constructor(public driver: U2FHIDDevice) {
    super();

    if (this.driver.protocolVersion !== 2) {
      throw new Error(
        `Driver has unsupported protocol version: ${this.driver.protocolVersion}. Only 2 suported.`,
      );
    }

    this.driver.on('disconnected', this._onDisconnected);
  }

  public async version() {
    return await this.command(U2F_VERSION);
  }

  // Send raw U2F Command using APDU message exchange protocol.
  // p1, p2 and data args are optional.
  public async command(cmd: number, p1 = 0, p2 = 0, data = Buffer.alloc(0)): Promise<Buffer> {
    // Create APDU Request frame
    const buf = Buffer.alloc(data.length + 7);
    buf[0] = 0; // CLA
    buf[1] = cmd; // INS
    buf[2] = p1; // P1
    buf[3] = p2; // P2
    buf[4] = 0; // LC1 (MSB)
    buf.writeUInt16BE(data.length, 5); // LC2, LC3 (LSB)
    data.copy(buf, 7);

    const deferred = new Deferred<Buffer>();
    this._sendCommand(buf, p1, Date.now(), true, deferred);
    return deferred.promise;
  }

  public async register(req: IU2FRegisterRequest): Promise<IU2FRegisterResponse> {
    const clientData = JSON.stringify({
      typ: U2F_CLIENT_DATA_TYP_REGISTER,
      challenge: req.challenge,
      origin: req.appId,
    });

    const buf = Buffer.concat([hash(clientData), hash(req.appId)]);
    const data = await this.command(U2F_REGISTER, 0, 0, buf);

    return {
      ...req,
      registrationData: toWebsafeBase64(data),
      clientData: toWebsafeBase64(clientData),
    };
  }

  public async authenticate(req: IU2FAuthenticateRequest): Promise<IU2FAuthenticateResponse> {
    const clientData = JSON.stringify({
      typ: U2F_CLIENT_DATA_TYP_AUTHENTICATE,
      challenge: req.challenge,
      origin: req.appId,
    });

    const keyHandle = Buffer.from(req.keyHandle, 'base64');
    const buf = Buffer.concat([
      hash(clientData),
      hash(req.appId),
      Buffer.from([keyHandle.length]),
      keyHandle,
    ]);

    const data = await this.command(U2F_AUTHENTICATE, U2F_AUTH_ENFORCE, 0, buf);
    return {
      ...req,
      signatureData: toWebsafeBase64(data),
      clientData: toWebsafeBase64(clientData),
    };
  }

  public async checkOnly(req: IU2FAuthenticateRequest) {
    const clientData = '';
    const keyHandle = Buffer.from(req.keyHandle, 'base64');

    const buf = Buffer.concat([
      hash(clientData),
      hash(req.appId),
      Buffer.from([keyHandle.length]),
      keyHandle,
    ]);

    try {
      await this.command(U2F_AUTHENTICATE, U2F_AUTH_CHECK_ONLY, 0, buf);
    } catch (e) {
      if (e.code === ERROR_CODES.SW_CONDITIONS_NOT_SATISFIED) {
        return true;
      }

      if (e.code === ERROR_CODES.SW_WRONG_DATA) {
        return false;
      }

      throw e;
    }
  }

  public close() {
    this.driver.close();
  }

  private async _sendCommand(
    buf: Buffer,
    p1: number,
    startTime: number,
    shouldSendUserPresenceEvent: boolean,
    deferred: Deferred<Buffer>,
  ) {
    // Send command to the driver.
    const res = await this.driver.msg(buf);
    if (res.length < 2) {
      throw new Error('Cannot decode APDU: returned data too short.');
    }

    // Decode APDU frame status
    const status = res.readUInt16BE(res.length - 2);
    if (status === ERROR_CODES.SW_NO_ERROR) {
      // Success; return data
      return deferred.resolve(res.slice(0, -2));
    } else if (
      status === ERROR_CODES.SW_CONDITIONS_NOT_SATISFIED &&
      !(p1 & 0x04) &&
      Date.now() - startTime < this.interactionTimeout
    ) {
      // We need user presence, but don't have it.
      // Wink and retry.
      if (shouldSendUserPresenceEvent) {
        this.emit('user-presence-required');
      }
      this.driver.wink();
      setTimeout(() => {
        this._sendCommand(buf, p1, startTime, false, deferred);
      }, this.interactionPollInterval);
    } else {
      const message = INVERT_ERROR_CODES[status] || `SW_UNKNOWN_ERROR: 0x${status.toString(16)}`;
      const err = new Error(message);
      (err as any).code = status;
      deferred.reject(err);
    }
  }

  private _onDisconnected = () => {
    this.emit('disconnected');
  }
}
