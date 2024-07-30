const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const BN = require('big.js');

module.exports = migration(async (deployer) => {
  const id = 'astronaut_tier_3';
  const totalSupply = 0;
  const name = "Astronaut Badge v3";
  const symbol = "ASTROv3"
  const uri = "https://badges.eventhorizon.tech/metadata/0760ca_astronaut_tier_3/";
  const commission = 1.31;
  const signer = process.env[`${hardhat.network.name.toUpperCase()}_NFT_SIGNER`];
  const priceFeed = process.env[`${hardhat.network.name.toUpperCase()}_NFT_PRICE_FEED`];
  const vault = await deployer.getContract('Vault');

  await deployer.deployProxy('contracts/NFT/ERC721V1.sol:ERC721V1', {
    name: 'AstronautTier3Badge',
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
    ],
  });
});
module.exports.tags = ['Upgradable'];
