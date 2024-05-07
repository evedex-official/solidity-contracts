const { buildModule } = require('@nomicfoundation/hardhat-ignition/modules');

const vaultModule = buildModule('VaultModule', (m) => {
  const proxyAdminOwner = m.getAccount(0);

  const initializeInterface = new ethers.Interface(['function initialize()']);
  const proxy = m.contract('TransparentUpgradeableProxy', [
    m.contract('VaultV1'),
    proxyAdminOwner,
    initializeInterface.encodeFunctionData('initialize', []),
  ]);
  const proxyAdminAddress = m.readEventArgument(proxy, 'AdminChanged', 'newAdmin');
  const proxyAdmin = m.contractAt('ProxyAdmin', proxyAdminAddress);

  const vault = m.contractAt('VaultV1', proxy, { id: 'Vault' });

  return { proxyAdmin, proxy, vault };
});

module.exports = vaultModule;
