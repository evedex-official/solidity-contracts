const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const { abi } = require('../../networks/abi/EHMarket.json');
const contracts = require('../../networks/contracts-networks.json');
const readline = require('node:readline');

module.exports = migration(async (deployer) => {
  const multisig = await deployer.getContract('GovernorMultisig');
  const multisigAddress = await multisig.getAddress();
  const ehMarketAddress =
    contracts[hardhat.network.name]?.EHMarket.address ?? process.env[`${hardhat.network.name}_EH_MARKET_V2`];
  const proxyAdminAddress =
    contracts[hardhat.network.name]?.EHMarket['upgradable.proxyAdmin'] ??
    process.env[`${hardhat.network.name}_EH_MARKET_V2_PROXY_ADMIN`];

  if (!ehMarketAddress) {
    console.log(`No EHMarketV2 address found for network ${hardhat.network.name}. Skipping transfer.`);
    return;
  }
  if (!proxyAdminAddress) {
    console.log(`No EHMarketV2 proxy admin address found for network ${hardhat.network.name}. Skipping transfer.`);
    return;
  }

  const EHMarketV2 = await hardhat.ethers.getContractAt(abi, ehMarketAddress);
  const DEFAULT_ADMIN_ROLE = await EHMarketV2.DEFAULT_ADMIN_ROLE();

  console.log('\n🚨 CRITICAL OPERATION: TRANSFERRING EHMARKETV2 ADMIN CONTROL 🚨');
  console.log('═'.repeat(60));
  console.log(`Network: ${hardhat.network.name}`);
  console.log(`EHMarketV2 Address: ${ehMarketAddress}`);
  console.log(`Proxy Admin Address: ${proxyAdminAddress}`);
  console.log(`Multisig Address: ${multisigAddress}`);
  console.log('═'.repeat(60));
  console.log('⚠️  This will transfer DEFAULT_ADMIN_ROLE and proxy admin ownership to multisig');
  console.log('⚠️  After this operation, only the multisig owners can manage EHMarketV2');
  console.log('⚠️  This includes contract upgrades and administrative functions');
  console.log('═'.repeat(60));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const answer = await new Promise((resolve) => {
    rl.question('\n❓ Do you want to proceed with transferring admin control? (type "YES" to confirm): ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });

  if (answer !== 'YES') {
    console.log('❌ Operation cancelled by user');
    return;
  }

  console.log('\n✅ User confirmed. Proceeding with admin transfer...');

  try {
    const tx = await EHMarketV2.grantRole(DEFAULT_ADMIN_ROLE, multisigAddress);
    console.log(`⏳ Transaction submitted: ${tx.hash}`);
    await tx.wait();
    console.log(`✅ EHMarketV2 DEFAULT_ADMIN_ROLE granted to multisig: ${multisigAddress}`);

    console.log('\n❓ Would you also like to transfer proxy admin ownership?');
    const proxyAnswer = await new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question('Type "TRANSFER" to transfer proxy admin ownership, or press Enter to skip: ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });

    if (proxyAnswer === 'TRANSFER') {
      const ProxyAdmin = await hardhat.ethers.getContractAt('ProxyAdmin', proxyAdminAddress);
      const tx2 = await ProxyAdmin.transferOwnership(multisigAddress);
      console.log(`⏳ Proxy admin transfer transaction submitted: ${tx2.hash}`);
      await tx2.wait();
      console.log(`✅ ProxyAdmin ownership transferred to multisig: ${multisigAddress}`);
    } else {
      console.log('ℹ️  Proxy admin ownership kept (can be transferred later)');
    }

    console.log("\n❓ Would you also like to revoke the deployer's admin role?");
    const revokeAnswer = await new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question('Type "REVOKE" to revoke deployer admin access, or press Enter to skip: ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });

    if (revokeAnswer === 'REVOKE') {
      const [signer] = await hardhat.ethers.getSigners();
      const tx3 = await EHMarketV2.revokeRole(DEFAULT_ADMIN_ROLE, signer.address);
      console.log(`⏳ Revoke transaction submitted: ${tx3.hash}`);
      await tx3.wait();
      console.log(`✅ EHMarketV2 DEFAULT_ADMIN_ROLE revoked from deployer: ${signer.address}`);
    } else {
      console.log('ℹ️  Deployer admin role kept (can be revoked later via multisig)');
    }

    console.log('\n🎉 Admin transfer completed successfully!');
    console.log('📝 EHMarketV2 is now controlled by the multisig contract');
    console.log('📝 Summary:');
    console.log(`   - DEFAULT_ADMIN_ROLE: ✅ Granted to multisig`);
    console.log(
      `   - Proxy Admin: ${proxyAnswer === 'TRANSFER' ? '✅ Transferred to multisig' : '⏸️  Kept with deployer'}`,
    );
    console.log(`   - Deployer Admin: ${revokeAnswer === 'REVOKE' ? '✅ Revoked' : '⏸️  Kept'}`);
  } catch (error) {
    console.error('❌ Error during admin transfer:', error.message);
    throw error;
  }
});

module.exports.tags = ['Upgradable', 'EHMarketV2TransferOwnerToMultisig'];
