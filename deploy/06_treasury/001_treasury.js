const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deployProxy('contracts/treasury/TreasuryV1.sol:TreasuryV1', {
    name: 'TreasuryUpgradable',
  });
});
module.exports.tags = ['Upgradable'];
