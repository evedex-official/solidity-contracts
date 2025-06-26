const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');

  await deployer.deployProxy('contracts/bridgeMiddleware/SwapManager.sol:SwapManager', {
    name: 'SwapManager',
    args: [await storage.getAddress(), deployer.namedAccounts.deployer.address],
    initializer: 'initialize',
  });

  const swapManager = await deployer.getContract('SwapManager');
  const key = ethers.id('EH:BridgeMiddleware:SwapManager');
  const currentAddress = await storage.getFunction('getAddress').staticCall(key);
  if (currentAddress.toLowerCase() !== (await swapManager.getAddress()).toLowerCase()) {
    await deployer.execute('Storage', 'setAddress', [key, await swapManager.getAddress()]);
    console.log(`✅ SwapManager address stored in Storage: ${await swapManager.getAddress()}`);
  } else {
    console.log(`✅ SwapManager already configured in Storage: ${await swapManager.getAddress()}`);
  }
});

module.exports.tags = ['SwapManager', 'Managers', 'Upgradable'];
module.exports.dependencies = ['Storage'];
