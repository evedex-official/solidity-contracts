const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');

  await deployer.deploy('contracts/bridgeMiddleware/MinimalProxyFactory.sol:MinimalProxyFactory', {
    name: 'MinimalProxyFactory',
    args: [await storage.getAddress()],
  });
});
module.exports.tags = ['NonUpgradable'];
