const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/cashback/CashbackVaultV2.sol:CashbackVaultV2', {
    name: 'CashbackVault',
  });
});
module.exports.tags = ['Upgradable', 'UpgradeCashbackVaultV1ToV2'];
