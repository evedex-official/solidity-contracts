const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const signer = process.env[`${hardhat.network.name.toUpperCase()}_CASHBACK_SIGNER`];
  const token = process.env[`${hardhat.network.name.toUpperCase()}_CASHBACK_TOKEN`];

  await deployer.deployProxy('contracts/cashback/CashbackVaultV1.sol:CashbackVaultV1', {
    name: 'CashbackVault',
    args: [token, signer],
  });
});
module.exports.tags = ['Upgradable'];
