const { migration } = require('../../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const [owner] = await ethers.getSigners();

  // Get token addresses from environment variables
  const networkName = hardhat.network.name;
  const usdtAddress = process.env[`${networkName}_USDT_ADDRESS`];
  const usdcAddress = process.env[`${networkName}_USDC_ADDRESS`];
  const wbtcAddress = process.env[`${networkName}_WBTC_ADDRESS`];

  console.log(`🔍 Populating contracts on ${networkName}:`);
  console.log(`USDT: ${usdtAddress || 'Not found'}`);
  console.log(`USDC: ${usdcAddress || 'Not found'}`);
  console.log(`WBTC: ${wbtcAddress || 'Not found'}`);

  // Get deployed router contracts
  const v3Router = await deployer.getContract('SwapRouterTestnetMock');
  const v4Router = await deployer.getContract('UniversalRouterTestnetMock');
  const weth = await deployer.getContract('TestnetWETH');

  const v3RouterAddress = await v3Router.getAddress();
  const v4RouterAddress = await v4Router.getAddress();
  const wethAddress = await weth.getAddress();

  console.log(`📍 Router addresses:`);
  console.log(`V3 Router: ${v3RouterAddress}`);
  console.log(`V4 Router: ${v4RouterAddress}`);
  console.log(`WETH: ${wethAddress}`);

  // Fixed funding amounts and minimum thresholds
  const fundingAmounts = {
    usdt: ethers.parseUnits('1000000', 6), // 1M USDT (6 decimals)
    usdc: ethers.parseUnits('1000000', 6), // 1M USDC (6 decimals)
    wbtc: ethers.parseUnits('100', 8), // 100 WBTC (8 decimals)
    eth: ethers.parseEther('0.1'), // 0.1 ETH
  };

  const minimumThresholds = {
    usdt: ethers.parseUnits('100000', 6), // 100K USDT threshold
    usdc: ethers.parseUnits('100000', 6), // 100K USDC threshold
    wbtc: ethers.parseUnits('10', 8), // 10 WBTC threshold
    eth: ethers.parseEther('0.001'), // 1 ETH threshold
  };

  const tokens = [
    {
      name: 'USDT',
      address: usdtAddress,
      amount: fundingAmounts.usdt,
      threshold: minimumThresholds.usdt,
      decimals: 6,
    },
    {
      name: 'USDC',
      address: usdcAddress,
      amount: fundingAmounts.usdc,
      threshold: minimumThresholds.usdc,
      decimals: 6,
    },
    {
      name: 'WBTC',
      address: wbtcAddress,
      amount: fundingAmounts.wbtc,
      threshold: minimumThresholds.wbtc,
      decimals: 8,
    },
  ];

  console.log('\n🔍 Checking router balances and populating if needed...');

  // Check balances and transfer if below threshold
  for (const token of tokens) {
    if (!token.address) {
      console.log(`⚠️  Skipping ${token.name} - address not provided`);
      continue;
    }

    try {
      const tokenContract = await ethers.getContractAt('IERC20', token.address);

      // Check V3 router balance
      const v3Balance = await tokenContract.balanceOf(v3RouterAddress);
      console.log(`📊 V3 Router ${token.name} balance: ${ethers.formatUnits(v3Balance, token.decimals)}`);

      if (v3Balance < token.threshold) {
        console.log(
          `💸 V3 Router ${token.name} below threshold (${ethers.formatUnits(token.threshold, token.decimals)}), transferring...`,
        );
        await tokenContract.transfer(v3RouterAddress, token.amount);
        console.log(`✅ Transferred ${ethers.formatUnits(token.amount, token.decimals)} ${token.name} to V3 router`);
      } else {
        console.log(`✓ V3 Router ${token.name} balance sufficient`);
      }

      // Check V4 router balance
      const v4Balance = await tokenContract.balanceOf(v4RouterAddress);
      console.log(`📊 V4 Router ${token.name} balance: ${ethers.formatUnits(v4Balance, token.decimals)}`);

      if (v4Balance < token.threshold) {
        console.log(
          `💸 V4 Router ${token.name} below threshold (${ethers.formatUnits(token.threshold, token.decimals)}), transferring...`,
        );
        await tokenContract.transfer(v4RouterAddress, token.amount);
        console.log(`✅ Transferred ${ethers.formatUnits(token.amount, token.decimals)} ${token.name} to V4 router`);
      } else {
        console.log(`✓ V4 Router ${token.name} balance sufficient`);
      }
    } catch (error) {
      console.error(`❌ Error checking/transferring ${token.name}:`, error.message);
    }
  }

  // Check ETH balances and fund if below threshold
  console.log('\n💰 Checking ETH balances and funding if needed...');
  try {
    const ethThreshold = minimumThresholds.eth;
    const ethAmount = fundingAmounts.eth;

    // Check V3 router ETH balance
    const v3EthBalance = await ethers.provider.getBalance(v3RouterAddress);
    console.log(`📊 V3 Router ETH balance: ${ethers.formatEther(v3EthBalance)}`);

    if (v3EthBalance < ethThreshold) {
      console.log(`💸 V3 Router ETH below threshold (${ethers.formatEther(ethThreshold)}), sending...`);
      await owner.sendTransaction({
        to: v3RouterAddress,
        value: ethAmount,
      });
      console.log(`✅ Sent ${ethers.formatEther(ethAmount)} ETH to V3 router`);
    } else {
      console.log(`✓ V3 Router ETH balance sufficient`);
    }

    // Check V4 router ETH balance
    const v4EthBalance = await ethers.provider.getBalance(v4RouterAddress);
    console.log(`📊 V4 Router ETH balance: ${ethers.formatEther(v4EthBalance)}`);

    if (v4EthBalance < ethThreshold) {
      console.log(`💸 V4 Router ETH below threshold (${ethers.formatEther(ethThreshold)}), sending...`);
      await owner.sendTransaction({
        to: v4RouterAddress,
        value: ethAmount,
      });
      console.log(`✅ Sent ${ethers.formatEther(ethAmount)} ETH to V4 router`);
    } else {
      console.log(`✓ V4 Router ETH balance sufficient`);
    }

    // Check WETH contract ETH balance
    const wethEthBalance = await ethers.provider.getBalance(wethAddress);
    console.log(`📊 WETH contract ETH balance: ${ethers.formatEther(wethEthBalance)}`);

    if (wethEthBalance < ethThreshold) {
      console.log(`💸 WETH contract ETH below threshold (${ethers.formatEther(ethThreshold)}), sending...`);
      await owner.sendTransaction({
        to: wethAddress,
        value: ethAmount,
      });
      console.log(`✅ Sent ${ethers.formatEther(ethAmount)} ETH to WETH contract`);
    } else {
      console.log(`✓ WETH contract ETH balance sufficient`);
    }
  } catch (error) {
    console.error('❌ Error checking/funding ETH:', error.message);
  }

  console.log('\n🎉 Balance check and population complete!');
  console.log('📝 Thresholds:');
  console.log(`   - USDT: ${ethers.formatUnits(minimumThresholds.usdt, 6)}`);
  console.log(`   - USDC: ${ethers.formatUnits(minimumThresholds.usdc, 6)}`);
  console.log(`   - WBTC: ${ethers.formatUnits(minimumThresholds.wbtc, 8)}`);
  console.log(`   - ETH: ${ethers.formatEther(minimumThresholds.eth)}`);
});

module.exports.tags = ['Mock', 'Testnet', 'Populate'];
module.exports.dependencies = ['SwapRouterTestnetMock', 'UniversalRouterTestnetMock', 'TestnetWETH'];
