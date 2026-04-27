const { migration } = require('../../scripts/deploy');
const { ethers } = require('ethers');
const hardhat = require('hardhat');

const NETWORKS = {
  arbitrum_one: {
    UPGRADE_EXECUTOR: '0xBde8acdeE0585051E2D9B1D7b51E9eaccE6c3c46',
    PROXY_ADMIN: '0xc2efa8cf4b2f63936538edf36821909fa95af1c7',
    GATEWAY_PROXY: '0x8D21dfEA9231Db85dCe72b8d9F18e917d833d4B1',
    BRIDGE_PROXY: '0xAD3026961087eccEC0508D411bb9fb405E086B38',
    GATEWAY_ORIGINAL_IMPL: '0x1d720642e63cB0f50be637e16E0f78B2D1b93f16',
    BRIDGE_ORIGINAL_IMPL: '0xB23214f241bdEb275f7dCBfbb1EA79349101d4B0',
  },
  arbitrum_sepolia: {
    UPGRADE_EXECUTOR: '0xF574f1dA4D6186B99fdfa280c240483e970B8d6e',
    PROXY_ADMIN: '0x60e0487966bb6f6f7ef7f12259cc75af4f06313e',
    GATEWAY_PROXY: '0xD27c3Bef20d90ed68Ca1aB7bfc7fAa4B58223E8f',
    BRIDGE_PROXY: '0x1006059Bb86890de3fc0b40FA1fE8f81F59F6932',
    GATEWAY_ORIGINAL_IMPL: '0x9F76417bfddf5dad933638D51373A7f646C054b9',
    BRIDGE_ORIGINAL_IMPL: '0x7CEd9fc520358C3Cbed561B33E1919056d4D82EA',
  },
};

module.exports = migration(async () => {
  const network = NETWORKS[hardhat.network.name];
  if (!network) throw new Error(`Unsupported network: ${hardhat.network.name}. Use arbitrum_one or arbitrum_sepolia`);

  const { UPGRADE_EXECUTOR, PROXY_ADMIN, GATEWAY_PROXY, BRIDGE_PROXY, GATEWAY_ORIGINAL_IMPL, BRIDGE_ORIGINAL_IMPL } =
    network;
  const proxyAdminIface = new ethers.Interface(['function upgrade(address proxy, address implementation)']);

  console.log(`\n===== ROLLBACK: Restore Original Implementations (${hardhat.network.name}) =====`);
  console.log('Call executeCall on UpgradeExecutor:', UPGRADE_EXECUTOR);
  console.log('Function: executeCall(address target, bytes data)\n');

  // Gateway rollback
  const gatewayRollbackData = proxyAdminIface.encodeFunctionData('upgrade', [GATEWAY_PROXY, GATEWAY_ORIGINAL_IMPL]);
  console.log('--- Gateway Rollback ---');
  console.log('Restoring implementation to:', GATEWAY_ORIGINAL_IMPL);
  console.log('target:', PROXY_ADMIN);
  console.log('data:', gatewayRollbackData);
  console.log('\ncast command:');
  console.log(
    `cast send ${UPGRADE_EXECUTOR} "executeCall(address,bytes)" ${PROXY_ADMIN} ${gatewayRollbackData} --rpc-url $RPC_URL --ledger`,
  );

  // Bridge rollback
  const bridgeRollbackData = proxyAdminIface.encodeFunctionData('upgrade', [BRIDGE_PROXY, BRIDGE_ORIGINAL_IMPL]);
  console.log('\n--- Bridge Rollback ---');
  console.log('Restoring implementation to:', BRIDGE_ORIGINAL_IMPL);
  console.log('target:', PROXY_ADMIN);
  console.log('data:', bridgeRollbackData);
  console.log('\ncast command:');
  console.log(
    `cast send ${UPGRADE_EXECUTOR} "executeCall(address,bytes)" ${PROXY_ADMIN} ${bridgeRollbackData} --rpc-url $RPC_URL --ledger`,
  );

  console.log('\n===== Rollback complete =====');
});
module.exports.tags = ['GatewayFundReleaseRollback'];
