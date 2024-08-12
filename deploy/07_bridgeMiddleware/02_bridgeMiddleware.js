const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/bridgeMiddleware/BridgeMiddleware.sol:BridgeMiddleware', {
    name: 'BridgeMiddleware',
  });
});
module.exports.tags = ['NonUpgradable'];
