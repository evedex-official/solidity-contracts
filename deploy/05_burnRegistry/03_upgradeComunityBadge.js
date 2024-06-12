const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  /*
  const friends20Badge = await deployer.getContract('Friends20Badge');
  const burnRegistry = await deployer.getContract('BurnRegistry');
  const NFTV2 = await ethers.getContractFactory('contracts/NFT/ERC721V2.sol:ERC721V2');

  await upgrades.upgradeProxy(await friends20Badge.getAddress(), NFTV2, {
    unsafeAllow: ['constructor'],
    call: { fn: 'migrateToV2', args: [await burnRegistry.getAddress()] },
  });
  */
});
module.exports.tags = ['Upgradable'];
