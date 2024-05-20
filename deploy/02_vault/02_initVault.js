const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const distributors = JSON.parse(process.env[`${hardhat.network.name}_VAULT_DISTRIBUTORS`] ?? '[]');

  if (distributors.length === 0) {
    throw new Error('Invalid distributors count');
  }

  await distributors.reduce(async (prev, address) => {
    return deployer.execute('Vault', 'addDistributor', [address]);
  }, Promise.resolve(null));
});
module.exports.tags = ['Upgradable'];
