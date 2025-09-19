const { ethers } = require('ethers');
const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');
  //
  // const paymentToken = process.env[`${hardhat.network.name}_BILLING_PAYMENT_TOKEN`];
  // if (!paymentToken) {
  //   console.error(`⚠️ Environment variable ${hardhat.network.name}_BILLING_PAYMENT_TOKEN is not set.`);
  //   console.log('⚠️  WARNING! Do not forget to set payment token in storage. Key for it: "EH:Billing:PaymentToken"');
  //   return;
  // }
  // const billingManagers = process.env[`${hardhat.network.name}_BILLING_MANAGERS`]
  //   ? JSON.parse(process.env[`${hardhat.network.name}_BILLING_MANAGERS`])
  //   : [];
  // if (billingManagers.length === 0) {
  //   console.error(`⚠️ Environment variable ${hardhat.network.name}_BILLING_MANAGERS is not set or empty.`);
  //   console.log('⚠️  WARNING! Do not forget to set managers in storage. Key for them: "EH:Billing:Manager:"');
  // }

  await deployer.deployProxy('contracts/billing/Billing.sol:Billing', {
    name: 'Billing',
    args: [await storage.getAddress(), deployer.namedAccounts.deployer.address],
    constructorArgs: [],
    initializer: 'initialize',
  });

  // if (paymentToken) {
  //   try {
  //     await storage.setAddress(ethers.id('EH:Billing:PaymentToken'), paymentToken);
  //     console.log(`✅ Set payment token: ${paymentToken}`);
  //   } catch (e) {
  //     console.error(
  //       `❌ Failed to set payment token ${paymentToken}. Probably ownership of Storage is transferred to multisig.`,
  //     );
  //   }
  // }
  // for (const manager of billingManagers) {
  //   try {
  //     const key = ethers.solidityPackedKeccak256(['string', 'address'], ['EH:Billing:Manager:', manager]);
  //     await storage.setBool(key, true);
  //     console.log(`✅ Set billing manager: ${manager}`);
  //   } catch (e) {
  //     console.error(
  //       `❌ Failed to set billing manager ${manager}. Probably ownership of Storage is transferred to multisig.`,
  //     );
  //   }
  // }
});

module.exports.tags = ['DeployBilling', 'Managers', 'Upgradable'];
module.exports.dependencies = ['Storage'];
