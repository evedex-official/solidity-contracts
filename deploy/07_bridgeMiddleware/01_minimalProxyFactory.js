const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/bridgeMiddleware/MinimalProxyFactory.sol:MinimalProxyFactory', {
    name: 'MinimalProxyFactory',
  });
});
module.exports.tags = ['NonUpgradable'];
