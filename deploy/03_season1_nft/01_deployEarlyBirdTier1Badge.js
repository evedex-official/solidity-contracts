const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const BN = require('big.js');

module.exports = migration(async (deployer) => {
  const id = 'early_bird_tier_1';
  const totalSupply = 2; // 50000
  const name = 'Early Horizon Badge v1';
  const symbol = 'EVEv1';
  const uri = 'https://badges.evedex.com/metadata/a356a19_early_bird_tier_1/';
  const commission = 1.31;
  const signer = process.env[`${hardhat.network.name.toUpperCase()}_NFT_SIGNER`];
  const priceFeed = process.env[`${hardhat.network.name.toUpperCase()}_NFT_PRICE_FEED`];
  const vault = await deployer.getContract('Vault');

  await deployer.deployProxy('contracts/NFT/BadgeV1.sol:BadgeV1', {
    name: 'EarlyBirdTier1Badge',
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
