const { ethers } = require('ethers');
const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const matchers = JSON.parse(process.env[`${hardhat.network.name}_EHMARKET_MATCHERS`] ?? '[]');
  const collateral = process.env[`${hardhat.network.name}_EHMARKET_COLLATERAL`];

  const initialWithdrawLimits = JSON.parse(process.env[`${hardhat.network.name}_EHMARKET_WITHDRAW_LIMITS`] || '[]');

  console.log(matchers, collateral, initialWithdrawLimits);

  if (matchers.some((matcher) => !ethers.isAddress(matcher))) {
    throw new Error('Invalid matcher wallet address');
  }

  await deployer.deployProxy('contracts/ehmarket/EHMarketV3.sol:EHMarketV3', {
    name: 'EHMarket',
    args: [matchers, collateral, initialWithdrawLimits],
  });
});
module.exports.tags = ['EHMarketV3'];
