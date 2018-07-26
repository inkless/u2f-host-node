const u2f = require('u2f')
const enumerateDevices = require('../dist/util').enumerateDevices
const U2FHIDDevice = require('../dist/u2f-hid-device').U2FHIDDevice
const U2FDevice = require('../dist/u2f-device').U2FDevice

const deviceInfo = enumerateDevices()[0]
// console.log(deviceInfo)

async function test() {
  const device = await U2FHIDDevice.open(deviceInfo)
  try {
    const data = await device.ping(Buffer.alloc(1, 1))
    console.log('PING', data.toString('hex'))
  } catch(e) {
    console.error(e)
  }

  try {
    const data = await device.wink()
    console.log('WINK', data.toString('hex'))
  } catch(e) {
    console.error(e)
  }

  try {
    const data = await device.msg(Buffer.alloc(0))
    console.log('MSG', data.toString('hex'))
  } catch(e) {
    console.error(e)
  }

  try {
    await device.command(0x90)
  } catch(e) {
    console.error(e)
  }

  device.close()
}

// test()

async function test2() {
  const device = await U2FHIDDevice.open(deviceInfo)
  const u2fDevice = new U2FDevice(device)
  try {
    const data = await u2fDevice.version()
    console.log('version', data.toString('hex'))
  } catch(e) {
    console.error(e)
  }

  try {
    const data = await u2fDevice.checkOnly({
      appId: 'file:///Users/inkless/playground/u2f-client/index.html',
      keyHandle: 'neNRIOz1-CHZdHxXw8VPqJ1ju5OIHdmCLOHxDmSD42NTduFISr10l3yPCNo8X9Jcizg661Jb1h_6FFaXawbNSw',
    })
    console.log('checkOnly', data)
  } catch (e) {
    console.error(e)
  }


  const appId = 'https://keevo.com'
  let registration
  try {
    const authRequest = u2f.request(appId)
    console.log('Touch the key to register')
    const data = await u2fDevice.register(authRequest)
    console.log('register', data)
    registration = u2f.checkRegistration(authRequest, data)
  } catch (e) {
    console.error(e)
  }

  // sign
  const signRequest = u2f.request(appId, registration.keyHandle)
  try {
    console.log('Touch the key to sign')
    const data = await u2fDevice.authenticate(signRequest)
    console.log('sign', data)

    const verified = u2f.checkSignature(signRequest, data, registration.publicKey)
    console.log('verified', verified)
  } catch (e) {
    console.error()
  }


  u2fDevice.close()
}

test2()

