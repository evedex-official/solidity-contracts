const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const multisig = await deployer.getContract('TreasuryUpgradable');

  return deployer.execute('TreasuryUpgradable', 'transferOwnership', [await multisig.getAddress()]);
});
module.exports.tags = ['Upgradable'];
