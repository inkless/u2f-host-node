U2F Host Node
=============

A u2f host implementation in node.js


## Usage
```javascript
async function register() {
  const registerRequest = {
    version: 'U2F_V2',
    appId: 'https://example.com',
    challenge: '1111100000000000000000000',
  }

  const data = await host.register(authRequest)
}

async function sign() {
  const signRequest = {
    version: 'U2F_V2',
    appId: 'https://example.com',
    challenge: '1111100000000000000000000',
    keyHandle: 'neNRIOz1-CHZdHxXw8VPqJ1ju5OIHdmCLOHxDmSD42NTduFISr10l3yPCNo8X9Jcizg661Jb1h_6FFaXawbNSw',
  }

  const data = await host.sign(signRequest)
}

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
