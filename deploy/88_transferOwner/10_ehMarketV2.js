const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');
const { abi } = require('../../networks/abi/EHMarket.json');

module.exports = migration(async (deployer) => {
  const multisig = await deployer.getContract('GovernorMultisig');
  const multisigAddress = await multisig.getAddress();
  const ehMarketAddress = process.env[`${hardhat.network.name}_EH_MARKET_V2`];
  if (!ehMarketAddress) {
    console.log(`No EHMarketV2 address found for network ${hardhat.network.name}. Skipping transfer.`);
    return;
  }
  const EHMarketV2 = await hardhat.ethers.getContractAt(abi, ehMarketAddress);
  const DEFAULT_ADMIN_ROLE = await EHMarketV2.DEFAULT_ADMIN_ROLE();

  const tx = await EHMarketV2.grantRole(DEFAULT_ADMIN_ROLE, multisigAddress);
  await tx.wait();
  console.log(`EHMarketV2 DEFAULT_ADMIN_ROLE granted to multisig: ${multisigAddress}`);

  // Optionally revoke the current deployer's admin role after granting to multisig
  const tx2 = await EHMarketV2.revokeRole(DEFAULT_ADMIN_ROLE, deployer.namedAccounts.deployer.address);
  await tx2.wait();
  console.log(`EHMarketV2 DEFAULT_ADMIN_ROLE revoked from deployer: ${deployer.namedAccounts.deployer.address}`);
});

module.exports.tags = ['Upgradable', 'EHMarketV2TransferOwnerToMultisig'];
