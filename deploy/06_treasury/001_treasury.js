const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deployProxy('contracts/Treasury/TreasuryV2.sol:TreasuryV2', {
    name: 'TreasuryUpgradable',
  });
});
module.exports.tags = ['Upgradable'];
