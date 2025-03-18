const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');
  const deployers = JSON.parse(process.env[`${hardhat.network.name}_MINIMAL_PROXY_FACTORY_DEPLOYER`] ?? '[]');

  if (deployers.length === 0) return;

  await deployers.reduce(async (prev, address) => {
    await prev;

    const key = hardhat.ethers.solidityPackedKeccak256(
      ['string', 'address'],
      ['EH:MinimalProxyFactory:Deployer:', address],
    );
    if (await storage.getBool(key)) return;

    return deployer.execute('Storage', 'setBool', [key, true]);
  }, Promise.resolve(null));
});
module.exports.tags = ['NonUpgradable'];