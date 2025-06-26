const { migration } = require('../../scripts/deploy');

// todo(shcube): TEST IT
module.exports = migration(async (deployer) => {
  const storage = await deployer.getContract('Storage');
  const networkName = deployer.hre.network.name.toUpperCase();

  console.log(`🔧 Configuring managers for ${deployer.hre.network.name}...`);

  // 1. Configure Uniswap V4 Universal Router
  const routerAddress =
    process.env[`${networkName}_UNISWAP_V4_UNIVERSAL_ROUTER`] ?? process.env.UNISWAP_V4_UNIVERSAL_ROUTER ?? '';
  if (routerAddress) {
    const routerKey = ethers.keccak256(ethers.toUtf8Bytes('EH:BridgeMiddleware:Swap:V4Router'));
    const currentRouter = await storage.getFunction('getAddress').staticCall(routerKey);
    if (currentRouter.toLowerCase() !== routerAddress.toLowerCase()) {
      await deployer.execute('Storage', 'setAddress', [routerKey, routerAddress]);
      console.log(`✅ Uniswap V4 Router configured: ${routerAddress}`);
    } else {
      console.log(`✅ Uniswap V4 Router already configured: ${routerAddress}`);
    }
  } else {
    console.log(`⚠️  No Uniswap V4 Router address found for ${deployer.hre.network.name}`);
  }

  // 2. Configure v4 pools
  const poolConfigs = {
    // USDC-USDT
    arbitrum: [
      {
        id: 'EH:BridgeMiddleware:SwapManager:V4_USDC_USDT',
        currency0: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        currency1: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        fee: 8,
        tickSpacing: 1,
        hooks: '0x0000000000000000000000000000000000000000',
      },
      // ETH-USDT
      {
        id: 'EH:BridgeMiddleware:SwapManager:V4_ETH_USDT',
        currency0: '0x0000000000000000000000000000000000000000',
        currency1: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        fee: 500,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
      },
    ],
  };

  const networkPools = poolConfigs[networkName] || [];
  if (networkPools.length === 0) {
    console.log(`⚠️  No pool configurations found for ${networkName}`);
    return;
  }
  console.log(`🏊 Configuring ${networkPools.length} pools for ${networkName}...`);

  for (const pool of networkPools) {
    const poolId = ethers.keccak256(ethers.toUtf8Bytes(pool.id));

    // Check if pool already exists
    const existingPool = await storage.getFunction('getBytes').staticCall(poolId);
    if (existingPool.length > 0) {
      console.log(`✅ Pool ${pool.id} already configured`);
      continue;
    }

    // Encode pool data
    const poolData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint24', 'int24', 'address'],
      [pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks],
    );

    await deployer.execute('Storage', 'setBytes', [poolId, poolData]);
    console.log(`✅ Pool ${pool.id} configured`);
    console.log(`   Currency0: ${pool.currency0}`);
    console.log(`   Currency1: ${pool.currency1}`);
    console.log(`   Fee: ${pool.fee}`);
    console.log(`   TickSpacing: ${pool.tickSpacing}`);
  }

  console.log(`🎉 SwapManager configuration completed for ${networkName}!`);
});

module.exports.tags = ['Config', 'Upgradable', 'SwapManagerConfig'];
module.exports.dependencies = ['Storage', 'SwapManager', 'DepositManager'];
