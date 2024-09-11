const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/tokens/USDC.sol:USDC', {
    name: 'USDC',
  });
});
module.exports.tags = ['NonUpgradable'];
