const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const badge = await deployer.getContract('SocialBadge');
  const BadgeV2 = await ethers.getContractFactory('contracts/NFT/BadgeV2.sol:BadgeV2');

  await upgrades.upgradeProxy(await badge.getAddress(), BadgeV2, {
    unsafeAllow: ['constructor'],
  });
});
module.exports.tags = ['Upgradable'];
