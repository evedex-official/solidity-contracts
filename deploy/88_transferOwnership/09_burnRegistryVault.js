const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const multisig = await deployer.getContract('GovernorMultisig');

  deployer.execute('BurnRegistryVault', 'transferOwnership', [await multisig.getAddress()]);
  console.log(`⏳ Proxy admin transfer transaction submitted: ${tx2.hash}`);


  const ProxyAdmin = await hardhat.ethers.getContractAt('ProxyAdmin', proxyAdminAddress);
  const tx2 = await ProxyAdmin.transferOwnership(multisigAddress);

  console.log(`⏳ Proxy admin transfer transaction submitted: ${tx2.hash}`);

  await tx2.wait();

  console.log(`✅ ProxyAdmin ownership transferred to multisig: ${multisigAddress}`);
});
module.exports.tags = ['Upgradable'];
