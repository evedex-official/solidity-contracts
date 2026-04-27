const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const contracts = require('../../networks/contracts-networks.json');
const readline = require('node:readline');
const contractName = 'EHMarket';
const { abi } = require(`../../networks/abi/EHMarket.json`);

module.exports = migration(async (deployer) => {
  const multisig = await deployer.getContract('GovernorMultisig');
  const multisigAddress = await multisig.getAddress();
  const contract = contracts[hardhat.network.name]?.[contractName];

  if (!contract) {
    console.log(`Contract ${contractName} not found for network ${hardhat.network.name}. Skipping.`);
    return;
  }

  const contractAddress = contracts[hardhat.network.name]?.[contractName].address;
  if (!contractAddress) {
    console.log(`No ${contractName} address found for network ${hardhat.network.name}. Skipping transfer.`);
    return;
  }

  const proxyAdminAddress = contracts[hardhat.network.name]?.[contractName]['upgradable.proxyAdmin'];
  if (!proxyAdminAddress) {
    console.log(`No ${contractName} proxy admin address found for network ${hardhat.network.name}. Skipping transfer.`);
    return;
  }

  const EHMarketV2 = await hardhat.ethers.getContractAt(abi, contractAddress);
  const DEFAULT_ADMIN_ROLE = await EHMarketV2.DEFAULT_ADMIN_ROLE();
  const [signer] = await hardhat.ethers.getSigners();

  console.log(`\n🚨 CRITICAL OPERATION: TRANSFERRING ${contractName} ADMIN CONTROL 🚨`);
  console.log('═'.repeat(60));
  console.log(`Network: ${hardhat.network.name}`);
  console.log(`${contractName} Address: ${contractAddress}`);
  console.log(`Proxy Admin Address: ${proxyAdminAddress}`);
  console.log(`Multisig Address: ${multisigAddress}`);
  console.log('═'.repeat(60));
  console.log('⚠️  This will transfer DEFAULT_ADMIN_ROLE and proxy admin ownership to multisig');
  console.log(`⚠️  After this operation, only the multisig owners can manage ${contractAddress}`);
  console.log('⚠️  This includes contract upgrades and administrative functions');
  console.log('═'.repeat(60));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let answer;
  if (process.env.AUTO_CONFIRM_TRANSFER_OWNERSHIP === 'true') {
    answer = 'YES';
    console.log('AUTO_CONFIRM_TRANSFER_OWNERSHIP=true, skipping confirmation');
  } else {
    answer = await new Promise((resolve) => {
      rl.question('\n❓ Do you want to proceed with transferring admin control? (type "YES" to confirm): ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  if (answer !== 'YES') {
    console.log('❌ Operation cancelled by user');
    return;
  }

  console.log('\n✅ User confirmed. Proceeding with admin transfer...');

  try {
    const is_admin = await EHMarketV2.hasRole(DEFAULT_ADMIN_ROLE, signer.address);
    if (!is_admin) {
      console.log(`❌ Can't transfer ownership, we are not admin`);
    } else {
      const tx = await EHMarketV2.grantRole(DEFAULT_ADMIN_ROLE, multisigAddress);
      console.log(`⏳ Transaction submitted: ${tx.hash}`);
      await tx.wait();
      console.log(`✅ ${contractName} DEFAULT_ADMIN_ROLE granted to multisig: ${multisigAddress}`);
    }

    console.log('\n❓ Would you also like to transfer proxy admin ownership?');
    console.log(`\n🚨 CRITICAL OPERATION: TRANSFERRING ${contractName} ADMIN CONTROL 🚨`);
    console.log('═'.repeat(60));
    console.log(`Network: ${hardhat.network.name}`);
    console.log(`${contractName} Address: ${contractAddress}`);
    console.log(`Proxy Admin Address: ${proxyAdminAddress}`);
    console.log(`Multisig Address: ${multisigAddress}`);
    console.log('═'.repeat(60));
    console.log('⚠️  This will transfer PROXY_ADMIN_ADDRESS OWNER to multisig');
    console.log('═'.repeat(60));

    let proxyAnswer;
    if (process.env.AUTO_CONFIRM_TRANSFER_OWNERSHIP === 'true') {
      proxyAnswer = 'TRANSFER';
      console.log('AUTO_CONFIRM_TRANSFER_OWNERSHIP=true, skipping confirmation');
    } else {
      proxyAnswer = await new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question('Type "TRANSFER" to transfer proxy admin ownership, or press Enter to skip: ', (answer) => {
          rl.close();
          resolve(answer);
        });
      });
    }

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
    let revokeAnswer;
    if (process.env.AUTO_CONFIRM_TRANSFER_OWNERSHIP === 'true') {
      revokeAnswer = 'REVOKE';
      console.log('AUTO_CONFIRM_TRANSFER_OWNERSHIP=true, skipping confirmation');
    } else {
      revokeAnswer = await new Promise((resolve) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question('Type "REVOKE" to revoke deployer admin access, or press Enter to skip: ', (answer) => {
          rl.close();
          resolve(answer);
        });
      });
    }

    if (revokeAnswer === 'REVOKE') {
      const tx3 = await EHMarketV2.revokeRole(DEFAULT_ADMIN_ROLE, signer.address);
      console.log(`⏳ Revoke transaction submitted: ${tx3.hash}`);
      await tx3.wait();
      console.log(`✅ ${contractName} DEFAULT_ADMIN_ROLE revoked from deployer: ${signer.address}`);
    } else {
      console.log('ℹ️  Deployer admin role kept (can be revoked later via multisig)');
    }

    console.log('\n🎉 Admin transfer completed successfully!');
    console.log(`📝 ${contractName} is now controlled by the multisig contract`);
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

module.exports.tags = ['Upgradable', `${contractName}TransferOwnerToMultisig`];
