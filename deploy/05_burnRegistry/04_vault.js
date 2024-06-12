const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deployProxy('contracts/vault/VaultV1.sol:VaultV1', {
    name: 'BurnRegistryVault',
    args: [],
  });
});
module.exports.tags = ['Upgradable'];
