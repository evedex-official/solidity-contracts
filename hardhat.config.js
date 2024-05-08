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
  paths: {
    deploy: path.resolve(__dirname, './deploy'),
    deployments: path.resolve(__dirname, './deployments'),
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      blockGasLimit: 10000000,
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
  },
  namedAccounts: {
    deployer: {
      '': 0,
    },
  },
};
