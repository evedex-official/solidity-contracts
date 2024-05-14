const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const BN = require('big.js');

module.exports = migration(async (deployer) => {
  const id = process.env[`${hardhat.network.name.toUpperCase()}_NFT_ID`];
  const name = process.env[`${hardhat.network.name.toUpperCase()}_NFT_NAME`];
  const symbol = process.env[`${hardhat.network.name.toUpperCase()}_NFT_SYMBOL`];
  const uri = process.env[`${hardhat.network.name.toUpperCase()}_NFT_URI`];
  const commission = process.env[`${hardhat.network.name.toUpperCase()}_NFT_COMMISSION`];
  const signer = process.env[`${hardhat.network.name.toUpperCase()}_NFT_SIGNER`];
  const priceFeed = process.env[`${hardhat.network.name.toUpperCase()}_NFT_PRICE_FEED`];
  const vault = await deployer.getContract('Vault');

  await deployer.deployProxy('contracts/NFT/ERC721V1.sol:ERC721V1', {
    name: 'AffiliateERC721',
    args: [
      hardhat.ethers.keccak256(hardhat.ethers.toUtf8Bytes(id)),
      0,
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
