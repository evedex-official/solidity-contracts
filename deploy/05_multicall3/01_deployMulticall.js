const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/multicall/Multicall3.sol:Multicall3', {
    name: 'Multicall3',
  });
});
module.exports.tags = ['NonUpgradable'];
