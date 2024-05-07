const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const ProxyModule = require("./ProxyModule");

const upgradeModule = buildModule("UpgradeModule", (m) => {
  const proxyAdminOwner = m.getAccount(0);

  const { proxyAdmin, proxy } = m.useModule(ProxyModule);

  m.call(proxyAdmin, "upgradeAndCall", [proxy, m.contract('DemoV2'), "0x"], {
    from: proxyAdminOwner,
  });

  return { proxyAdmin, proxy };
});

const demoV2Module = buildModule("DemoV2Module", (m) => {
  const { proxy } = m.useModule(upgradeModule);

  const demo = m.contractAt("DemoV2", proxy);

  return { demo };
});

module.exports = demoV2Module;