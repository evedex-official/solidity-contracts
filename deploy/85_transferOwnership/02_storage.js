const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const contracts = require('../../networks/contracts-networks.json');
const readline = require('node:readline');
const contractName = 'Storage';
const { abi } = require(`../../networks/abi/Storage.json`);

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

  const ContactInstance = await hardhat.ethers.getContractAt(abi, contractAddress);
  const [signer] = await hardhat.ethers.getSigners();

  console.log(`\n🚨 CRITICAL OPERATION: TRANSFERRING ${contractName} ADMIN CONTROL 🚨`);
  console.log('═'.repeat(60));
  console.log(`Network: ${hardhat.network.name}`);
  console.log(`${contractName} Address: ${contractAddress}`);
  console.log(`Multisig Address: ${multisigAddress}`);
  console.log('═'.repeat(60));
  console.log('⚠️  This will transfer Ownertship of the contract to multisig');
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
    const is_admin = await ContactInstance.owner() === signer.address;
    if (!is_admin) {
      console.log(`❌ Can't transfer ownership, we are not admin`);
    } else {
      const tx = await ContactInstance.transferOwnership(multisigAddress);
      console.log(`⏳ Transaction submitted: ${tx.hash}`);
      await tx.wait();
      console.log(`✅ ${contractName} ownership granted to multisig: ${multisigAddress}`);
    }

    console.log('\n🎉 Admin transfer completed successfully!');
    console.log(`📝 ${contractName} is now controlled by the multisig contract`);
    console.log('📝 Summary:');
  } catch (error) {
    console.error('❌ Error during admin transfer:', error.message);
    throw error;
  }
});

module.exports.tags = ['Upgradable', `${contractName}TransferOwnerToMultisig`];
