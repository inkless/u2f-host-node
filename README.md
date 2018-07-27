U2F Host Node
=============

A u2f host implementation in node.js


## Usage
```javascript
const u2f = require('u2f')
const U2FHost = require('u2f-host-node')

async function main() {
  const host = U2FHost.discover()
  const appId = 'https://example.com'

  // register
  const registerReq = u2f.request(appId)
  console.log('Touch the key to register')
  const registerResponse = await host.register(registerReq)
  const registration = u2f.checkRegistration(authRequest, registerResponse)

  // sign
  const signRequest = u2f.request(appId, registration.keyHandle)
  console.log('Touch the key to sign')
  const signResponse = await host.sign(signRequest)
  const verified = u2f.checkSignature(signRequest, signResponse, registration.publicKey)
}

main()
```

## Docs

## Development
### Prerequisites
Before development, make sure you installed all packages. We are using yarn for this project.

```bash
yarn
```

### Developing SDK
```bash
## build
yarn build

## test
yarn test
# or watch changes
yarn test:dev

## lint
yarn lint
```

## FAQ
