const { migration } = require('../../scripts/deploy');
const { ethers } = require('ethers');
const hardhat = require('hardhat');

const NETWORKS = {
  arbitrum_one: {
    UPGRADE_EXECUTOR: '0xBde8acdeE0585051E2D9B1D7b51E9eaccE6c3c46',
    PROXY_ADMIN: '0xc2efa8cf4b2f63936538edf36821909fa95af1c7',
    GATEWAY_PROXY: '0x8D21dfEA9231Db85dCe72b8d9F18e917d833d4B1',
    BRIDGE_PROXY: '0xAD3026961087eccEC0508D411bb9fb405E086B38',
  },
  arbitrum_sepolia: {
    UPGRADE_EXECUTOR: '0xF574f1dA4D6186B99fdfa280c240483e970B8d6e',
    PROXY_ADMIN: '0x60e0487966bb6f6f7ef7f12259cc75af4f06313e',
    GATEWAY_PROXY: '0xD27c3Bef20d90ed68Ca1aB7bfc7fAa4B58223E8f',
    BRIDGE_PROXY: '0x1006059Bb86890de3fc0b40FA1fE8f81F59F6932',
  },
};

module.exports = migration(async (deployer) => {
  const network = NETWORKS[hardhat.network.name];
  if (!network) throw new Error(`Unsupported network: ${hardhat.network.name}. Use arbitrum_one or arbitrum_sepolia`);

  const { UPGRADE_EXECUTOR, PROXY_ADMIN, GATEWAY_PROXY, BRIDGE_PROXY } = network;
  const impl = await deployer.artifacts.readDeploy('GatewayFundRelease');

  const proxyAdminIface = new ethers.Interface(['function upgrade(address proxy, address implementation)']);

  console.log(`\n===== Gateway & Bridge Upgrade Calldata (${hardhat.network.name}) =====`);
  console.log('Call executeCall on UpgradeExecutor:', UPGRADE_EXECUTOR);
  console.log('Function: executeCall(address target, bytes data)\n');

  // Gateway upgrade
  const gatewayUpgradeData = proxyAdminIface.encodeFunctionData('upgrade', [GATEWAY_PROXY, impl.address]);
  console.log('--- Gateway Upgrade ---');
  console.log('target:', PROXY_ADMIN);
  console.log('data:', gatewayUpgradeData);
  console.log('\ncast command:');
  console.log(
    `cast send ${UPGRADE_EXECUTOR} "executeCall(address,bytes)" ${PROXY_ADMIN} ${gatewayUpgradeData} --rpc-url $RPC_URL --ledger`,
  );

  // Bridge upgrade
  const bridgeUpgradeData = proxyAdminIface.encodeFunctionData('upgrade', [BRIDGE_PROXY, impl.address]);
  console.log('\n--- Bridge Upgrade ---');
  console.log('target:', PROXY_ADMIN);
  console.log('data:', bridgeUpgradeData);
  console.log('\ncast command:');
  console.log(
    `cast send ${UPGRADE_EXECUTOR} "executeCall(address,bytes)" ${PROXY_ADMIN} ${bridgeUpgradeData} --rpc-url $RPC_URL --ledger`,
  );

  console.log('\n===== After upgrade, release funds =====');
  console.log('\n--- Release USDT from Gateway ---');
  console.log(
    `cast send ${GATEWAY_PROXY} "releaseFunds(address,address,uint256)" <USDT_ADDRESS> <YOUR_LEDGER_EOA> <AMOUNT> --rpc-url $RPC_URL --ledger`,
  );
  console.log('\n--- Release ETH from Bridge ---');
  console.log(
    `cast send ${BRIDGE_PROXY} "releaseETH(address,uint256)" <YOUR_LEDGER_EOA> <AMOUNT> --rpc-url $RPC_URL --ledger`,
  );
  console.log('\n===== Done =====');
});
module.exports.tags = ['GatewayFundReleaseUpgrade'];
