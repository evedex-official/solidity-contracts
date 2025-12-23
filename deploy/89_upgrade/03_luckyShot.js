const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  await deployer.deployProxyImplementation('LuckyShot', 'contracts/luckyShot/LuckyShotV2.sol:LuckyShotV2', {
    unsafeAllow: ['constructor'],
  });

  const proxy = await deployer.getContract('LuckyShot');
  const proxyAddress = await proxy.getAddress();
  const artifact = await hardhat.artifacts.readArtifact('contracts/luckyShot/LuckyShotV2.sol:LuckyShotV2');
  const factory = await hardhat.ethers.getContractFactoryFromArtifact(artifact);
  const implementationAddress = await hardhat.upgrades.prepareUpgrade(proxyAddress, factory, {
    unsafeAllow: ['constructor'],
  });

  console.log('\n========== UPGRADE INSTRUCTIONS ==========');
  console.log('Proxy address:', proxyAddress);
  console.log('New implementation:', implementationAddress);
  console.log('\nCall from multisig:');
  console.log('Target:', proxyAddress);
  console.log('Function: upgradeToAndCall(address,bytes)');
  console.log('Arguments:');
  console.log('  newImplementation:', implementationAddress);
  console.log('  data: 0x');
  console.log('===========================================\n');
});

module.exports.tags = ['Upgradable', 'UpgradeLuckyShot'];
