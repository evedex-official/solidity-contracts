const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const proxy = await deployer.getContract('BurnRegistry');
  const implementation = await ethers.getContractFactory(
    'contracts/NFT/burnRegistry/BurnRegistryV2.sol:BurnRegistryV2',
  );

  await upgrades.upgradeProxy(await proxy.getAddress(), implementation, {
    unsafeAllow: ['constructor'],
  });
});
module.exports.tags = ['Upgradable'];
