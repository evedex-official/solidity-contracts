const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');

  const initSubPlans = JSON.parse(process.env[`${hardhat.network.name}_INIT_SUBSCRIPTION_PLANS`] ?? '[]');

  if (initSubPlans.length === 0) {
    console.warn(
      '⚠️  WARNING! No initial subscription plans provided! Do not forget to set them later. Function for this: "setSubscriptionPlans"',
    );
  }

  await deployer.deployProxy('contracts/billing/Billing.sol:Billing', {
    name: 'Billing',
    args: [await storage.getAddress(), deployer.namedAccounts.deployer.address, initSubPlans],
    constructorArgs: [],
    initializer: 'initialize',
  });

  console.log('⚠️  WARNING! Do not forget to set managers in storage. Key for them: "EH:Billing:Manager:"');
  console.log('⚠️  WARNING! Do not forget to set payment token in storage. Key for it: "EH:Billing:PaymentToken:"');
});

module.exports.tags = ['DeployBilling', 'Managers', 'Upgradable'];
module.exports.dependencies = ['Storage'];
