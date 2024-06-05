const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  await deployer.execute('PriceFeedMock', 'setRound', ['380527718660']);
});
module.exports.tags = ['Mock'];
