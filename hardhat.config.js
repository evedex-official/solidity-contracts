require('@nomicfoundation/hardhat-ethers');
require('@openzeppelin/hardhat-upgrades');
require('@nomicfoundation/hardhat-chai-matchers');
require('./scripts/deploy');
require('dotenv').config();
const path = require('path');

function accounts(...names) {
  return names.reduce((accounts, name) => (process.env[name] ? [...accounts, process.env[name]] : accounts), []);
}

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  sourcify: {
    enabled: true,
    // Optional: specify a different Sourcify server
    apiUrl: "https://sourcify.dev/server",
    // Optional: specify a different Sourcify repository
    browserUrl: "https://repo.sourcify.dev",
  },
  paths: {
    deploy: path.resolve(__dirname, './deploy'),
    deployments: path.resolve(__dirname, './deployments'),
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      blockGasLimit: 10000000,
    },
    mainnet: {
      url: process.env.MAINNET,
      chainId: 1,
      // gasPrice: 200_000_000_000,
      blockGasLimit: 6_000_000,
      accounts: accounts('DEPLOYER'),
    },
    optimism: {
      url: process.env.OP_MAINNET,
      chainId: 10,
      // gasPrice: 200_000_000_000,
      blockGasLimit: 6_000_000,
      accounts: accounts('DEPLOYER'),
    },
    arbitrum_one: {
      url: process.env.ARBITRUM_ONE_NODE,
      chainId: 42161,
      // gasPrice: 200_000_000_000,
      blockGasLimit: 30_000_000,
      accounts: accounts('DEPLOYER'),
    },
    sepolia: {
      url: process.env.SEPOLIA_NODE,
      chainId: 11155111,
      // gasPrice: 200_000_000_000,
      blockGasLimit: 6_000_000,
      accounts: accounts('DEPLOYER'),
    },
    raspberry: {
      url: process.env.RASPBERRY_NODE,
      chainId: 123420111,
      gasPrice: 1_000_000_000,
      blockGasLimit: 6_000_000,
      accounts: accounts('DEPLOYER'),
    },
    eventum_testnet: {
      url: process.env.EVENTUM_TESTNET_NODE,
      chainId: 16182,
      gasPrice: 1_000_000_000,
      blockGasLimit: 30_000_000,
      accounts: accounts('DEPLOYER'),
    },
    eventum_demo: {
      url: process.env.EVENTUM_TESTNET_NODE,
      chainId: 16182,
      gasPrice: 1_000_000_000,
      blockGasLimit: 30_000_000,
      accounts: accounts('DEPLOYER'),
    },
  },
  etherscan: {
    apiKey: {
      arbitrumOne: process.env.ARBITRUM_ONE_ETHERSCAN
    }
  },
  namedAccounts: {
    deployer: {
      '': 0,
    },
  },
};
