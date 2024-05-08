const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const owners = JSON.parse(process.env[`${hardhat.network.name}_MULTISIG_OWNERS`] ?? '[]');
  if (owners.length === 0) {
    throw new Error('Invalid owners count');
  }

  const decisiveOwners = Number(process.env[`${hardhat.network.name}_MULTISIG_DECISIVE_OWNERS`] ?? '2');
  if (decisiveOwners > owners.length) {
    throw new Error('Decisive owners number must be less than all owners');
  }
  if (decisiveOwners <= 0) {
    throw new Error('Decisive owners number must be positive');
  }

  await deployer.execute('GovernorMultisig', 'transferOwnershipWithHowMany', [owners, decisiveOwners]);
});
module.exports.tags = ['Governance', 'NonUpgradable'];
