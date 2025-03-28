const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');

  await deployer.deployProxy('contracts/vault/VaultV2.sol:VaultV2', {
    name: 'Vault',
    args: [await storage.getAddress()],
  });
});
module.exports.tags = ['Upgradable'];
