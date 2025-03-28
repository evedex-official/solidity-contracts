const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');
  const distributors = JSON.parse(process.env[`${hardhat.network.name}_VAULT_DISTRIBUTORS`] ?? '[]');

  if (distributors.length === 0) {
    throw new Error('Invalid distributors count');
  }

  await distributors.reduce(async (prev, address) => {
    await prev;

    const key = hardhat.ethers.solidityPackedKeccak256(
      ['string', 'address'],
      ['EH:PartnerVault:Distributor:', address],
    );
    if (await storage.getBool(key)) return;

    return deployer.execute('Storage', 'setBool', [key, true]);
  }, Promise.resolve(null));
});
module.exports.tags = ['Upgradable'];
