const { buildModule } = require('@nomicfoundation/hardhat-ignition/modules');

const mockModule = buildModule('MockModule', (m) => {
  const erc20 = m.contract('ERC20Mock');

  return { erc20 };
});

module.exports = mockModule;
