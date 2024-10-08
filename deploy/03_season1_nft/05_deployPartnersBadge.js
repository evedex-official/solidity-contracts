const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const BN = require('big.js');

module.exports = migration(async (deployer) => {
  const id = 'partners';
  const totalSupply = 0;
  const name = "Partner Badge";
  const symbol = "PBDGeve"
  const uri = "https://badges.eventhorizon.tech/metadata/ac28d46_partners/";
  const commission = 1.31;
  const signer = process.env[`${hardhat.network.name.toUpperCase()}_NFT_SIGNER`];
  const priceFeed = process.env[`${hardhat.network.name.toUpperCase()}_NFT_PRICE_FEED`];
  const vault = await deployer.getContract('Vault');

  await deployer.deployProxy('contracts/NFT/BadgeV1.sol:BadgeV1', {
    name: 'PartnersBadge',
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
