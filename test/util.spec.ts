import { expect } from 'chai';
import * as HID from 'node-hid';
import { SinonStub, stub } from 'sinon';
import { enumerateDevices, fromWebsafeBase64, hash, invert, toWebsafeBase64 } from '../src/util';

describe('Util', function () {
  context('#enumerateDevices', function () {
    let devicesStub: SinonStub;
    beforeEach(function () {
      devicesStub = stub(HID, 'devices');
    });

    afterEach(function () {
      devicesStub.restore();
    });

    it('should enumerate fido devices', function () {
      devicesStub.returns([{ usagePage: 0xf1d0, usage: 1 }]);
      const devices = enumerateDevices();
      expect(devices.length).to.equal(1);
    });

    it('should return empty array if no devices', function () {
      devicesStub.returns([]);
      const devices = enumerateDevices();
      expect(devices.length).to.equal(0);
    });

    it('should return correctly for custom detectFn', function () {
      devicesStub.returns([{ usagePage: 0x00, usage: 1 }]);
      const devices = enumerateDevices(() => true);
      expect(devices.length).to.equal(1);
    });
  });

  context('#invert', function () {
    it('should invert object', function () {
      const obj = { a: 'b' };
      expect(invert(obj)).to.eql({ b: 'a' });
    });
  });

  context('#toWebsafeBase64', function () {
    it('should compute to webSafeBase64', function () {
      const str = toWebsafeBase64('hello');
      expect(str).to.equal('aGVsbG8');
    });
  });

  context('#fromWebsafeBase64', function () {
    it('should compute back to buffer', function () {
      const buf = fromWebsafeBase64('aGVsbG8');
      expect(buf.toString('hex')).to.equal('68656c6c6f');
    });
  });

  context('#hash', function () {
    it('should compute hash', function () {
      const h = hash('hello');
      expect(h.toString('hex')).to.equal(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
      );
    });
  });
});
