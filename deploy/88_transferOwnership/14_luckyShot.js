const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const multisig = await deployer.getContract('GovernorMultisig');

  return deployer.execute('LuckyShot', 'transferOwnership', [await multisig.getAddress()]);
});

module.exports.tags = ['Upgradable', 'LuckyShotTransferOwnerToMultisig'];
