const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/governance/GovernorMultisig.sol:GovernorMultisig', {
    name: 'GovernorMultisig',
  });
});
module.exports.tags = ['Governance', 'NonUpgradable'];
