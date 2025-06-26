const { migration } = require('../../scripts/deploy');

// todo(shcube): TEST IT
module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');

  await deployer.deployProxy('contracts/bridgeMiddleware/DepositManager.sol:DepositManager', {
    name: 'DepositManager',
    args: [await storage.getAddress(), deployer.namedAccounts.deployer.address],
    initializer: 'initialize',
  });

  const depositManager = await deployer.getContract('DepositManager');
  const key = ethers.id('EH:BridgeMiddleware:DepositManager');
  const currentAddress = await storage.getFunction('getAddress').staticCall(key);
  if (currentAddress.toLowerCase() !== (await depositManager.getAddress()).toLowerCase()) {
    await deployer.execute('Storage', 'setAddress', [key, await depositManager.getAddress()]);
    console.log(`✅ DepositManager address stored in Storage: ${await depositManager.getAddress()}`);
  } else {
    console.log(`✅ DepositManager already configured in Storage: ${await depositManager.getAddress()}`);
  }
});

module.exports.tags = ['DepositManager', 'Managers', 'Upgradable'];
module.exports.dependencies = ['Storage'];
