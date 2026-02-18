const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const multisig = await deployer.getContract('GovernorMultisig');

  return deployer.execute('ContestVault', 'transferOwnership', [await multisig.getAddress()]);
});

module.exports.tags = ['Upgradable', 'ContestVaultTransferOwnerToMultisig'];
