const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');

  await deployer.deployProxy('contracts/contestVault/ContestVault.sol:ContestVault', {
    name: 'ContestVault',
    args: [await storage.getAddress(), deployer.namedAccounts.deployer.address],
    initializer: 'initialize',
  });

  const signerStorageKey = ethers.id('EH:ContestVault:Signer');
  try {
    await storage.setAddress(signerStorageKey, await deployer.namedAccounts.deployer.address);
    console.log(`Set ContestVault signer role to deployer. Key in storage: ${signerStorageKey}`);
  } catch {
    console.warn(`WARNING: manually set EH:ContestVault:Signer in storage. Key: ${signerStorageKey} `);
  }
});

module.exports.tags = ['ContestVault', 'Upgradable'];
module.exports.dependencies = ['Storage'];
