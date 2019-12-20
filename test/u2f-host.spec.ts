import { expect } from 'chai';
import { U2FHost } from '../src/u2f-host';
import * as u2f from 'u2f';

const appId = 'https://u2f-host-node.com';

describe('U2F Host', function () {
  let registration: any;
  let host: U2FHost;

  before(function () {
    host = U2FHost.discover();
  });

  it('should device correctly', function () {
    expect(host.devices).to.ok;
  });

  it('should register correctly', async function () {
    this.timeout(30 * 1000);
    const regRequest = u2f.request(appId);
    console.log('Touch the key to register');
    const data = await host.register(regRequest);
    registration = u2f.checkRegistration(regRequest, data);
    expect(registration.successful).to.be.true;
  });

  it('should authenticate correctly', async function () {
    this.timeout(30 * 1000);
    const signRequest = u2f.request(appId, registration.keyHandle);
    console.log('Touch the key to authenticate');
    const data = await host.authenticate(signRequest);
    const verified = u2f.checkSignature(signRequest, data, registration.publicKey);
    expect(verified.successful).to.be.true;
  });
});
