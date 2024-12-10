# Tests (old)

- `npm run test` - run all test files
- `npm run test -- ./path/to/*` - run all test files in directory
- `npm run test -- ./path/to/test.js` - run target test file

# Deploy

Check `.env` and `hardhat.config.js` before deploy modules.

- `npm run deploy -- --network sepolia --deploy ./deploy/dir` - deploy with scripts

# Export contracts addresses and ABI

- `npm run export-abi` - export ABI
- `npm run export-deploy -- --network sepolia` - export contract addresses for this network

# Export for verification (example)!

- `node scripts/export-verify-json.js artifacts/contracts/governance/Multiownable.sol/Multiownable.dbg.json`