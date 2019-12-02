const u2f = require('u2f')
const U2FHost = require('..').U2FHost

async function main() {
  const host = U2FHost.discover()

  const appId = 'https://u2f-host-node.com'
  let registration
  try {
    const regRequest = u2f.request(appId)
    console.log('reqRequest', regRequest)
    console.log('Touch the key to register...')
    const data = await host.register(regRequest)
    // console.log('register', data)
    registration = u2f.checkRegistration(regRequest, data)
    console.log('registration', registration)
  } catch (e) {
    console.error(e)
  }

  // sign
  const signRequest = u2f.request(appId, registration.keyHandle)
  console.log('signRequest', signRequest)
  try {
    // console.log('signRequest', signRequest)
    console.log('Touch the key to sign...')
    const data = await host.authenticate(signRequest)
    console.log('sign', data)

    const verified = u2f.checkSignature(signRequest, data, registration.publicKey)
    console.log('verified', verified)
  } catch (e) {
    console.error(e)
  }
}

main()

