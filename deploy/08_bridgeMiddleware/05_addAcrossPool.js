const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');
  const acrossPool = process.env[`${hardhat.network.name}_BRIDGE_MIDDLEWARE_ACROSS_POOL`] ?? '';

  if (!acrossPool) return;

  const key = ethers.keccak256(ethers.toUtf8Bytes('EH:BridgeMiddleware:Bridge:Across'));
  const currentAddress = await storage.getFunction('getAddress').staticCall(key);
  if (currentAddress.toLowerCase() === acrossPool.toLowerCase()) return;

  await deployer.execute('Storage', 'setAddress', [key, acrossPool]);
});
module.exports.tags = ['NonUpgradable'];