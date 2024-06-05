const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/mock/PriceFeedMock.sol:PriceFeedMock', {
    name: 'PriceFeedMock',
  });
});
module.exports.tags = ['Mock', 'NonUpgradable'];
