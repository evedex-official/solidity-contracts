const { migration } = require('../../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/mock/ERC20Mock.sol:ERC20Mock', {
    name: 'ERC20Mock',
  });
});
module.exports.tags = ['Mock', 'NonUpgradable'];
