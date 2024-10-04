const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const BN = require('big.js');

module.exports = migration(async (deployer) => {
  const id = 'early_bird_tier_3';
  const totalSupply = 0;
  const name = 'Early Horizon Badge v3';
  const symbol = 'EVEv3';
  const uri = 'https://badges.eventhorizon.tech/metadata/b04c54_early_bird_tier_3/';
  const commission = 1.31;
  const signer = process.env[`${hardhat.network.name.toUpperCase()}_NFT_SIGNER`];
  const priceFeed = process.env[`${hardhat.network.name.toUpperCase()}_NFT_PRICE_FEED`];
  const vault = await deployer.getContract('Vault');

  await deployer.deployProxy('contracts/NFT/BadgeV1.sol:BadgeV1', {
    name: 'EarlyBirdTier3Badge',
    args: [
      hardhat.ethers.keccak256(hardhat.ethers.toUtf8Bytes(id)),
      totalSupply,
      name,
      symbol,
      uri,
      BN(commission).mul(1e18).toString(),
      signer,
      priceFeed,
      await vault.getAddress(),
      hardhat.ethers.ZeroAddress,
    ],
  });
});
module.exports.tags = ['Upgradable'];
