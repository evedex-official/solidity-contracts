const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/tokens/USDT.sol:USDT', {
    name: 'USDT',
  });
});
module.exports.tags = ['NonUpgradable'];
