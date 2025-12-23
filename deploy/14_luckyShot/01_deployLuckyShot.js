const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');

  await deployer.deployProxy('contracts/luckyShot/LuckyShot.sol:LuckyShot', {
    name: 'LuckyShot',
    args: [await storage.getAddress(), deployer.namedAccounts.deployer.address],
    initializer: 'initialize',
  });

  const signerStorageKey = ethers.id('EH:LuckyShot:Signer');
  try {
    await storage.setAddress(signerStorageKey, await deployer.namedAccounts.deployer.address);
    console.log(`Set LuckyShot signer role to deployer. Key in storage: ${signerStorageKey}`);
  } catch {
    console.warn(`WARNING: manually set EH:LuckyShot:Signer in storage. Key: ${signerStorageKey} `);
  }
});

module.exports.tags = ['LuckyShot', 'Upgradable'];
module.exports.dependencies = ['Storage'];
