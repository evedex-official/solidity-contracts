const { migration } = require('../../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const weth = await deployer.getContract('TestnetWETH');
  const wethAddress = await weth.getAddress();
  await deployer.deploy('contracts/mock/SwapRouterTestnetMock.sol:SwapRouterTestnetMock', {
    name: 'SwapRouterTestnetMock',
    args: [wethAddress],
  });
});

module.exports.tags = ['Mock', 'NonUpgradable', 'Testnet'];
module.exports.dependencies = ['TestnetWETH'];
