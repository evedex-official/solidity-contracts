const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/storage/Storage.sol:Storage', {
    name: 'Storage',
  });
});
module.exports.tags = ['NonUpgradable'];
