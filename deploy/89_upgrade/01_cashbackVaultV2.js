const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  // await deployer.upgradeProxy('CashbackVault', 'contracts/cashback/CashbackVaultV2.sol:CashbackVaultV2', {
  //   unsafeAllow: ['constructor'],
  // });
  await deployer.deployProxyImplementation('CashbackVault', 'contracts/cashback/CashbackVaultV2.sol:CashbackVaultV2', {
    unsafeAllow: ['constructor'],
  });
});
module.exports.tags = ['Upgradable', 'UpgradeCashbackVaultV1ToV2'];
