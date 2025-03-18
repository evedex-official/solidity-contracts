const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');
  const defaultBridge = process.env[`${hardhat.network.name}_BRIDGE_MIDDLEWARE_DEFAULT_BRIDGE`] ?? '';
  if (!defaultBridge) return;

  const key = ethers.keccak256(ethers.toUtf8Bytes('EH:BridgeMiddleware:Bridge:Default'));
  const currentAddress = await storage.getFunction('getAddress').staticCall(key);
  if (currentAddress.toLowerCase() === defaultBridge.toLowerCase()) return;

  await deployer.execute('Storage', 'setAddress', [key, defaultBridge]);
});
