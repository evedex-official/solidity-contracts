const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const BN = require('big.js');

module.exports = migration(async (deployer) => {
  const id = 'early_bird_tier_2';
  const totalSupply = 20; // 100000
  const name = "Early Horizon Badge v2";
  const symbol = "EVEv2"
  const uri = "https://badges.evedex.com/metadata/a2b7913_early_bird_tier_2/";
  const commission = 1.31;
  const signer = process.env[`${hardhat.network.name.toUpperCase()}_NFT_SIGNER`];
  const priceFeed = process.env[`${hardhat.network.name.toUpperCase()}_NFT_PRICE_FEED`];
  const vault = await deployer.getContract('Vault');

  await deployer.deployProxy('contracts/NFT/BadgeV1.sol:BadgeV1', {
    name: 'EarlyBirdTier2Badge',
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
