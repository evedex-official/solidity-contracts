const { migration } = require('../../scripts/deploy');
const hardhat = require("hardhat");

module.exports = migration(async (deployer) => {
  await deployer.deploy('contracts/tokens/EVE.sol:Eventum', {
    name: 'EVE',
    args: [],
  });
});
module.exports.tags = ['NonUpgradable'];
