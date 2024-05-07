const { ethers } = require('hardhat');
const { buildModule } = require('@nomicfoundation/hardhat-ignition/modules');

/**
 * This is the first module that will be run. It deploys the proxy and the proxy admin, and returns them so that they can be used by other modules.
 */
const proxyModule = buildModule('ProxyModule', (m) => {
  const proxyAdminOwner = m.getAccount(0);

  const initializeInterface = new ethers.Interface(['function initialize(uint256)']);
  const proxy = m.contract('TransparentUpgradeableProxy', [
    m.contract('DemoV1'),
    proxyAdminOwner,
    initializeInterface.encodeFunctionData('initialize', [5]),
  ]);

  const proxyAdminAddress = m.readEventArgument(proxy, 'AdminChanged', 'newAdmin');

  const proxyAdmin = m.contractAt('ProxyAdmin', proxyAdminAddress);

  return { proxyAdmin, proxy };
});

const demoV1Module = buildModule('DemoModule', (m) => {
  const { proxy, proxyAdmin } = m.useModule(proxyModule);

  const demo = m.contractAt('DemoV1', proxy);

  return { demo, proxy, proxyAdmin };
});

module.exports = demoV1Module;
