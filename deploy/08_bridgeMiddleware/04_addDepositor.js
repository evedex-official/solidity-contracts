const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');
  const depositors = JSON.parse(process.env[`${hardhat.network.name}_BRIDGE_MIDDLEWARE_DEPOSITOR`] ?? '[]');

  if (depositors.length === 0) return;

  await depositors.reduce(async (prev, address) => {
    await prev;

    const key = hardhat.ethers.solidityPackedKeccak256(
      ['string', 'address'],
      ['EH:BridgeMiddleware:Depositor:', address],
    );
    if (await storage.getBool(key)) return;

    return deployer.execute('Storage', 'setBool', [key, true]);
  }, Promise.resolve(null));
});
module.exports.tags = ['NonUpgradable'];