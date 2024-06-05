const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deployProxy('contracts/multicall/Multicall3.sol:Multicall3', {
    name: 'Multicall3',
    args: [],
  });
});
module.exports.tags = ['NonUpgradable'];
