const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const BN = require('big.js');

module.exports = migration(async (deployer) => {
  const multisig = await deployer.getContract('GovernorMultisig');

  return deployer.execute('EarlyBirdTier2Badge', 'transferOwnership', [await multisig.getAddress()]);
});
module.exports.tags = ['Upgradable'];
