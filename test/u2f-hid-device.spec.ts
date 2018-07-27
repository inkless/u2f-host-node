import { expect } from 'chai';
import { U2FHIDDevice } from '../src/u2f-hid-device';
import { enumerateDevices } from '../src/util';

const device = enumerateDevices()[0];

describe('U2F HID Device', function () {
  before(async function () {
    this.hidDevice = await U2FHIDDevice.open(device);
  });

  after(function () {
    this.hidDevice.close();
  });

  it('should open device correctly', function () {
    expect(this.hidDevice).to.ok;
    expect(this.hidDevice.protocolVersion).to.equal(2);
  });

  it('should ping', async function () {
    const data = await this.hidDevice.ping(Buffer.alloc(1, 1));
    expect(data).to.eql(Buffer.alloc(1, 1));
  });

  it('should wink', async function () {
    const data = await this.hidDevice.wink();
    expect(data).to.eql(Buffer.alloc(0));
  });

  it('should msg', async function () {
    const data = await this.hidDevice.msg(Buffer.from([127, 127]));
    expect(data).to.eql(Buffer.from([0x6e, 0x00]));
  });

  it('should throw error when unknown command', async function () {
    try {
      await this.hidDevice.command(0x90);
    } catch (e) {
      expect(e.message).to.equal('Invalid command');
    }
  });
});
