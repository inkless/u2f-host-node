import { createHash } from 'crypto';
import { Device, devices } from 'node-hid';

const FIDO_USAGE_PAGE = 0xf1d0;
const FIDO_USAGE_U2FHID = 1;

export function enumerateDevices() {
  return devices().filter(function (deviceInfo: Device) {
    const isCompatible =
      deviceInfo.usagePage === FIDO_USAGE_PAGE && deviceInfo.usage === FIDO_USAGE_U2FHID;

    return isCompatible;
  });
}

export function invert(obj: { [key: string]: string | number }) {
  const newObj: { [key: string]: string } = {};
  Object.keys(obj).forEach((key) => {
    newObj[obj[key]] = key;
  });
  return newObj;
}

export function toWebsafeBase64(buf: Buffer | string) {
  if (!Buffer.isBuffer(buf)) {
    buf = Buffer.from(buf);
  }

  return buf
    .toString('base64')
    .replace(/\//g, '_')
    .replace(/\+/g, '-')
    .replace(/=+$/, '');
}

export function fromWebsafeBase64(base64: string) {
  const normalBase64 =
    base64.replace(/\-/g, '+').replace(/_/g, '/') + '=='.substring(0, (3 * base64.length) % 4);
  return Buffer.from(normalBase64, 'base64');
}

export function hash(data: Buffer | string) {
  return createHash('SHA256')
    .update(data)
    .digest();
}
