import { expect } from 'chai';
import { enumerateDevices, fromWebsafeBase64, hash, invert, toWebsafeBase64 } from '../src/util';

describe('Util', function () {
  context('#enumerateDevices', function () {
    it('should enumerate fido devices', function () {
      const devices = enumerateDevices();
      expect(devices.length).to.ok;
    });

    it('should enumerate all devices', function () {
      const devices = enumerateDevices(() => true);
      expect(devices.length).to.ok;
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
