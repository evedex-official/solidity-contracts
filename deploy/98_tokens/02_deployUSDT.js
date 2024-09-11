const { migration } = require('../../scripts/deploy');
const hardhat = require("hardhat");

module.exports = migration(async (deployer) => {

  const signer = process.env[`${hardhat.network.name.toUpperCase()}_ERC20_OWNER`];

  await deployer.deploy('contracts/tokens/USDT.sol:USDT', {
    name: 'USDT',
    args: [signer, signer],
  });
});
module.exports.tags = ['NonUpgradable'];
