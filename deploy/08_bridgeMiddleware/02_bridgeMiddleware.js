const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/bridgeMiddleware/BridgeMiddlewareV1.sol:BridgeMiddlewareV1', {
    name: 'BridgeMiddlewareV1',
  });
  await deployer.deploy('contracts/bridgeMiddleware/BridgeMiddlewareV2.sol:BridgeMiddlewareV2', {
    name: 'BridgeMiddlewareV2',
  });
});
module.exports.tags = ['NonUpgradable'];
