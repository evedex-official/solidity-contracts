const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');

  await deployer.deployProxy('contracts/billing/Billing.sol:Billing', {
    name: 'Billing',
    args: [await storage.getAddress(), deployer.namedAccounts.deployer.address],
    constructorArgs: [],
    initializer: 'initialize',
  });

  console.log('⚠️  WARNING! Do not forget to set managers in storage. Key for them: "EH:Billing:Manager:"');
  console.log('⚠️  WARNING! Do not forget to set payment token in storage. Key for it: "EH:Billing:PaymentToken"');
});

module.exports.tags = ['DeployBilling', 'Managers', 'Upgradable'];
module.exports.dependencies = ['Storage'];
