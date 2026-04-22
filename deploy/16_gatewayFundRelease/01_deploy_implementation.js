const { migration } = require('../../scripts/deploy');

module.exports = migration(async (deployer) => {
  const authorizedRecipient = process.env[`${require('hardhat').network.name}_FUND_RELEASE_RECIPIENT`];
  if (!authorizedRecipient) {
    throw new Error('FUND_RELEASE_RECIPIENT env var not set (e.g. arbitrum_one_FUND_RELEASE_RECIPIENT=0x...)');
  }

  await deployer.deploy('contracts/gateway/GatewayFundRelease.sol:GatewayFundRelease', {
    name: 'GatewayFundRelease',
    args: [authorizedRecipient],
  });
});
module.exports.tags = ['GatewayFundRelease'];
