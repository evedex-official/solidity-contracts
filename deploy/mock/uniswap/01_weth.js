const { migration } = require('../../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const [owner] = await ethers.getSigners();
  await deployer.deploy('contracts/mock/TestnetWETH.sol:TestnetWETH', {
    name: 'TestnetWETH',
    args: [await owner.getAddress()],
  });
});
module.exports.tags = ['Mock', 'NonUpgradable', 'Testnet'];
