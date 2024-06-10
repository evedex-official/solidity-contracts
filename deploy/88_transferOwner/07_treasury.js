const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const multisig = await deployer.getContract('Treasury');

  return deployer.execute('Treasury', 'transferOwnership', [await multisig.getAddress()]);
});
module.exports.tags = ['Upgradable'];
