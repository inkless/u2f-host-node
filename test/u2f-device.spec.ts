import { expect } from 'chai';
import { U2FDevice } from '../src/u2f-device';
import { U2FHIDDevice } from '../src/u2f-hid-device';
import { enumerateDevices } from '../src/util';

const u2f = require('u2f'); // tslint:disable-line

const device = enumerateDevices()[0];
const appId = 'https://u2f-host-node.com';

describe('U2F Device', function () {
  let registration: any;

  before(async function () {
    const hidDevice = await U2FHIDDevice.open(device);
    this.u2fDevice = new U2FDevice(hidDevice);
  });

  after(function () {
    this.u2fDevice.close();
  });

  it('should open device correctly', function () {
    expect(this.u2fDevice).to.ok;
  });

  it('should check version', async function () {
    const data = await this.u2fDevice.version();
    expect(data).to.eql(Buffer.from([0x55, 0x32, 0x46, 0x5f, 0x56, 0x32]));
  });

  it('should checkOnly correctly', async function () {
    this.timeout(30 * 1000);
    const regRequest = u2f.request(appId);
    console.log('Touch the key to register'); // tslint:disable-line
    const response = await this.u2fDevice.register(regRequest);
    const { keyHandle } = u2f.checkRegistration(regRequest, response);
    const data = await this.u2fDevice.checkOnly({
      appId: 'https://u2f-host-node.com',
      keyHandle,
    });
    expect(data).to.be.true;
  });

  it('should register correctly', async function () {
    this.timeout(30 * 1000);
    const regRequest = u2f.request(appId);
    console.log('Touch the key to register'); // tslint:disable-line
    const data = await this.u2fDevice.register(regRequest);
    registration = u2f.checkRegistration(regRequest, data);
    expect(registration.successful).to.be.true;
  });

  it('should authenticate correctly', async function () {
    this.timeout(30 * 1000);
    const signRequest = u2f.request(appId, registration.keyHandle);
    console.log('Touch the key to authenticate'); // tslint:disable-line
    const data = await this.u2fDevice.authenticate(signRequest);
    const verified = u2f.checkSignature(signRequest, data, registration.publicKey);
    expect(verified.successful).to.be.true;
  });
});
