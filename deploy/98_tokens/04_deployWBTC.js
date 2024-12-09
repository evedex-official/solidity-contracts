const { migration } = require('../../scripts/deploy');
const hardhat = require("hardhat");

module.exports = migration(async (deployer) => {
  const signer = process.env[`${hardhat.network.name.toUpperCase()}_ERC20_OWNER`];

  await deployer.deploy('contracts/tokens/WBTC.sol:WBTC', {
    name: 'WBTC',
    args: [signer, signer],
  });
});
module.exports.tags = ['NonUpgradable'];
