const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const BN = require('big.js');

module.exports = migration(async (deployer) => {
  const id = 'friends_20';
  const totalSupply = 0;
  const name = "Community Badge";
  const symbol = "CBDGeve"
  const uri = "https://badges.eventhorizon.tech/metadata/574d18_friends_20/";
  const commission = 1.31;
  const signer = process.env[`${hardhat.network.name.toUpperCase()}_NFT_SIGNER`];
  const priceFeed = process.env[`${hardhat.network.name.toUpperCase()}_NFT_PRICE_FEED`];
  const vault = await deployer.getContract('Vault');
  const burnRegistry = await deployer.getContract('BurnRegistry');

  await deployer.deployProxy('contracts/NFT/BadgeV1.sol:BadgeV1', {
    name: 'Friends20Badge',
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
      await burnRegistry.getAddress(),
    ],
  });
});
module.exports.tags = ['Upgradable'];
