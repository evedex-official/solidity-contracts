const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const BN = require('big.js');

module.exports = migration(async (deployer) => {
  const id = 'astronaut_tier_0';
  const totalSupply = 1000;
  const name = "Astronaut Badge v0";
  const symbol = "ASTROv0"
  const uri = "https://badges.eventhorizon.tech/metadata/da4b92_astronaut_tier_0/";
  const commission = 1.31;
  const signer = process.env[`${hardhat.network.name.toUpperCase()}_NFT_SIGNER`];
  const priceFeed = process.env[`${hardhat.network.name.toUpperCase()}_NFT_PRICE_FEED`];
  const vault = await deployer.getContract('Vault');

  await deployer.deployProxy('contracts/NFT/ERC721V1.sol:ERC721V1', {
    name: 'AstronautTier0Badge',
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
