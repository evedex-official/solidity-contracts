const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const badge = await deployer.getContract('Friends20Badge');
  const BadgeV3 = await ethers.getContractFactory('contracts/NFT/BadgeV3.sol:BadgeV3');

  await upgrades.upgradeProxy(await badge.getAddress(), BadgeV3, {
    unsafeAllow: ['constructor'],
  });
});
module.exports.tags = ['Upgradable'];
