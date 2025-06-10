const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');
  const dvfDepositContract = process.env[`${hardhat.network.name}_BRIDGE_MIDDLEWARE_DVF_DEPOSIT`] ?? '';

  if (!dvfDepositContract) return;

  const key = ethers.keccak256(ethers.toUtf8Bytes('EH:BridgeMiddleware:Bridge:DVF'));
  const currentAddress = await storage.getFunction('getAddress').staticCall(key);
  if (currentAddress.toLowerCase() === dvfDepositContract.toLowerCase()) return;

  await deployer.execute('Storage', 'setAddress', [key, dvfDepositContract]);
});
module.exports.tags = ['NonUpgradable'];
