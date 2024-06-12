const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const distributors = JSON.parse(process.env[`${hardhat.network.name}_BURN_REGISTRY_DISTRIBUTORS`] ?? '[]');

  if (distributors.length === 0) {
    throw new Error('Invalid distributors count');
  }

  await distributors.reduce(async (prev, address) => {
    await prev;
    return deployer.execute('BurnRegistryVault', 'addDistributor', [address]);
  }, Promise.resolve(null));
});
module.exports.tags = ['Upgradable'];
