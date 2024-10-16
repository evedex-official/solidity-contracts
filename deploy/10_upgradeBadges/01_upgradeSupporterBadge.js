const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const badge = await deployer.getContract('SupporterBadge');
  const BadgeV2 = await ethers.getContractFactory('contracts/NFT/BadgeV1.sol:BadgeV1');

  await upgrades.upgradeProxy(await badge.getAddress(), BadgeV2, {
    unsafeAllow: ['constructor'],
  });
});
module.exports.tags = ['Upgradable'];
