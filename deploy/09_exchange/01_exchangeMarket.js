const { migration } = require('../../scripts/deploy');
const hardhat = require("hardhat");

module.exports = migration(async (deployer) => {
  const matcher = process.env[`${hardhat.network.name.toUpperCase()}_MATCHER`];
  const usdt = await deployer.getContract('USDT');

  await deployer.deploy('contracts/exchange/EHMarket.sol:EHMarket', {
    name: 'EHMarket',
    args: [
        [matcher], usdt
    ],
  });
});
module.exports.tags = ['NonUpgradable'];
