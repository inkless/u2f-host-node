import { EventEmitter } from 'events';
import { Device } from 'node-hid';
import Deferred from './defer';
import { IU2FAuthenticateRequest, IU2FRegisterRequest, U2FDevice } from './u2f-device';
import { U2FHIDDevice } from './u2f-hid-device';
import { enumerateDevices } from './util';

type DetectFunction = (d: Device) => boolean;

const DEVICE_CACHE_TIME = 100;

export class U2FHost extends EventEmitter {
  public static protocolVersion = 'U2F_V2';

  public static discover(detectFn?: DetectFunction) {
    return new U2FHost({ detectFn });
  }

  public waitForDevicesPollInterval = 200;
  public waitForDevicesTimeout = 10 * 1000;
  public userPresenceTimeout = 10 * 1000;

  public devices: Device[] = [];
  public detectFn: DetectFunction | undefined;

  private _lastSync: number = 0;

  constructor({ detectFn }: { detectFn?: DetectFunction }) {
    super();

    this.detectFn = detectFn;
    this.syncDevices();
  }

  public syncDevices() {
    this.devices = enumerateDevices(this.detectFn);
    this._lastSync = Date.now();
  }

  public async register(req: IU2FRegisterRequest) {
    return await this._doWithDevices(async (d: U2FDevice) => {
      return await d.register(req);
    });
  }

  public async authenticate(req: IU2FAuthenticateRequest) {
    return await this._doWithDevices(async (d: U2FDevice) => {
      return await d.authenticate(req);
    });
  }

  private _getDevices() {
    const currentTs = Date.now();
    if (this.devices && currentTs - this._lastSync < DEVICE_CACHE_TIME) {
      return this.devices;
    }

    this.syncDevices();
    return this.devices;
  }

  private async _doWithDevices(fn: (d: U2FDevice) => any) {
    const devices = await this._waitForDevices();

    let eventEmitted = false;
    return Promise.race(devices.map(async (device) => {
      const hidDevice = await U2FHIDDevice.open(device);
      const u2fDevice = new U2FDevice(hidDevice);
      u2fDevice.interactionTimeout = this.userPresenceTimeout;
      u2fDevice.on('user-presence-required', () => {
        if (!eventEmitted) {
          this.emit('user-presence-required');
          eventEmitted = true;
        }
      });

      try {
        return await fn(u2fDevice);
      } catch (e) {
        // throw e;
        console.error(e); // tslint:disable-line
      } finally {
        u2fDevice.close();
      }
    }));
  }

  private async _waitForDevices() {
    const deferred = new Deferred<Device[]>();

    const startTime = Date.now();
    let eventEmitted = false;
    const poll = () => {
      const devices = this._getDevices();
      if (devices.length > 0) {
        deferred.resolve(devices);
        return;
      }

      if (Date.now() - startTime > this.waitForDevicesTimeout) {
        throw new Error('Timed out waiting for U2F device');
      }

      if (!eventEmitted) {
        this.emit('waiting-for-device');
        eventEmitted = true;
      }

      setTimeout(poll, this.waitForDevicesPollInterval);
    };
    poll();
    return deferred.promise;
  }
}
