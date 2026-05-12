const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/bridgeMiddleware/LocalBridge.sol:LocalBridge', {
    name: 'LocalBridge',
    args: [],
  });

  const storage = await deployer.getContract('Storage');
  const localBridge = await deployer.getContract('LocalBridge');
  const key = ethers.keccak256(ethers.toUtf8Bytes('EH:BridgeMiddleware:Bridge:Default'));
  const currentAddress = await storage.getFunction('getAddress').staticCall(key);
  if (currentAddress.toLowerCase() !== (await localBridge.getAddress()).toLowerCase()) {
    await deployer.execute('Storage', 'setAddress', [key, await localBridge.getAddress()]);
    console.log(`LocalBridge registered in Storage: ${await localBridge.getAddress()}`);
  } else {
    console.log(`LocalBridge already configured in Storage: ${await localBridge.getAddress()}`);
  }
});

module.exports.tags = ['LocalBridge', 'NonUpgradable'];
module.exports.dependencies = ['Storage'];
