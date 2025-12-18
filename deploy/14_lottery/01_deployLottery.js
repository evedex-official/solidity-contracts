const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');

  await deployer.deployProxy('contracts/lottery/Lottery.sol:Lottery', {
    name: 'Lottery',
    args: [await storage.getAddress(), deployer.namedAccounts.deployer.address],
    initializer: 'initialize',
  });

  const signerStorageKey = ethers.id('EH:Lottery:Signer');
  try {
    await storage.setAddress(signerStorageKey, await deployer.namedAccounts.deployer.address);
    console.log(`Set lottery signer role to deployer. Key in storage: ${signerStorageKey}`);
  } catch {
    console.warn(`WARNING: manually set EH:Lottery:Signer in storage. Key: ${signerStorageKey} `);
  }
});

module.exports.tags = ['Lottery', 'Upgradable'];
module.exports.dependencies = ['Storage'];
