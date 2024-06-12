const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const BN = require('big.js');

module.exports = migration(async (deployer) => {
  const friends20Badge = await deployer.getContract('Friends20Badge');
  const priceFeed = process.env[`${hardhat.network.name.toUpperCase()}_NFT_PRICE_FEED`];
  const commission = 3;

  await deployer.deployProxy('contracts/NFT/burnRegistry/BurnRegistryV1.sol:BurnRegistryV1', {
    name: 'BurnRegistry',
    args: [await friends20Badge.getAddress(), priceFeed, BN(commission).mul(1e18).toString()],
  });
});
module.exports.tags = ['Upgradable'];
