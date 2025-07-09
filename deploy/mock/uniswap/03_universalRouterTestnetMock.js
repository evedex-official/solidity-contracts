const { migration } = require('../../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/mock/UniversalRouterTestnetMock.sol:UniversalRouterTestnetMock', {
    name: 'UniversalRouterTestnetMock',
  });
});

module.exports.tags = ['Mock', 'NonUpgradable', 'Testnet'];
