'use strict';

const { expect } = require('chai');
const { ethers, upgrades, network } = require('hardhat');

describe('BridgeMiddleware Integration - Arbitrum Fork', function () {
  let owner, depositor, officer;
  let bridgeMiddleware, storage, minimalProxyFactory, dvfDeposit, defaultBridge;
  let depositManager, swapManager;
  let usdc, usdt;

  const zeroAddress = '0x0000000000000000000000000000000000000000';
  const key = ethers.id;
  const anyValue = () => true;

  const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
  const USDT_ADDRESS = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
  const DVF_DEPOSIT_ADDRESS = '0x10417734001162Ea139e8b044DFe28DbB8B28ad0';
  const DEFAULT_BRIDGE_ADDRESS = '0x1628CE6477221fdD1CD88ea3D15d587DfC59E66A';
  const UNISWAP_V4_UNIVERSAL_ROUTER_ADDRESS = '0xa51afafe0263b40edaef0df8781ea9aa03e381a3';
  const UNISWAP_V3_SWAP_ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
  const PERMIT2_ADDRESS = '0x000000000022d473030f116ddee9f6b43ac78ba3';
  const ETH_ADDRESS = zeroAddress;
  const WETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

  const whaleAddresses = {
    [USDC_ADDRESS]: '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7',
    [USDT_ADDRESS]: '0x5a52E96BAcdaBb82fd05763E25335261B270Efcb',
  };

  before(async function () {
    if (!process.env.ARBITRUM_ONE_NODE) {
      console.log('ARBITRUM_ONE_NODE not set, skipping integration tests');
      this.skip();
    }
    console.log('🔄 Setting up Arbitrum fork...');
    await network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.ARBITRUM_ONE_NODE,
          },
        },
      ],
    });
    const chainId = await network.provider.request({ method: 'eth_chainId' });
    console.log(`📡 Forked Arbitrum at chain ID: ${parseInt(chainId, 16)}`);
    [owner, depositor, officer] = await ethers.getSigners();
    usdc = await ethers.getContractAt('ERC20Mock', USDC_ADDRESS);
    usdt = await ethers.getContractAt('ERC20Mock', USDT_ADDRESS);

    const usdcSymbol = await usdc.symbol();
    const usdtSymbol = await usdt.symbol();
    console.log(`tokens: ${usdcSymbol}, ${usdtSymbol}`);

    await setupContracts();
  });

  async function setupContracts() {
    const Storage = await ethers.getContractFactory('Storage');
    storage = await Storage.deploy();
    await storage.waitForDeployment();

    const DepositManager = await ethers.getContractFactory('DepositManager');
    depositManager = await upgrades.deployProxy(DepositManager, [await storage.getAddress(), await owner.getAddress()]);
    await depositManager.waitForDeployment();

    const SwapManager = await ethers.getContractFactory('SwapManager');
    swapManager = await upgrades.deployProxy(SwapManager, [await storage.getAddress(), await owner.getAddress()], {
      constructorArgs: [PERMIT2_ADDRESS, WETH_ADDRESS],
    });
    await swapManager.waitForDeployment();

    const BridgeMiddleware = await ethers.getContractFactory('BridgeMiddlewareV2');
    bridgeMiddleware = await BridgeMiddleware.deploy();
    await bridgeMiddleware.waitForDeployment();

    const MinimalProxyFactory = await ethers.getContractFactory('MinimalProxyFactory');
    minimalProxyFactory = await MinimalProxyFactory.deploy(await storage.getAddress());
    await minimalProxyFactory.waitForDeployment();

    defaultBridge = await ethers.getContractAt('DefaultBridgeMock', DEFAULT_BRIDGE_ADDRESS);
    dvfDeposit = await ethers.getContractAt('DVFDepositContractMock', DVF_DEPOSIT_ADDRESS);

    // Configure storage
    await storage.setAddress(key('EH:BridgeMiddleware:Bridge:DVF'), DVF_DEPOSIT_ADDRESS);
    await storage.setAddress(key('EH:BridgeMiddleware:Bridge:Default'), DEFAULT_BRIDGE_ADDRESS);
    await storage.setAddress(key('EH:BridgeMiddleware:Swap:V4Router'), UNISWAP_V4_UNIVERSAL_ROUTER_ADDRESS);
    await storage.setAddress(key('EH:BridgeMiddleware:Swap:V3Router'), UNISWAP_V3_SWAP_ROUTER_ADDRESS);
    await storage.setAddress(key('EH:BridgeMiddleware:DepositManager'), await depositManager.getAddress());
    await storage.setAddress(key('EH:BridgeMiddleware:SwapManager'), await swapManager.getAddress());

    // Set permissions
    await storage.setBool(
      ethers.solidityPackedKeccak256(
        ['string', 'address'],
        ['EH:MinimalProxyFactory:Deployer:', await owner.getAddress()],
      ),
      true,
    );
    await storage.setBool(
      ethers.solidityPackedKeccak256(
        ['string', 'address'],
        ['EH:BridgeMiddleware:Depositor:', await depositor.getAddress()],
      ),
      true,
    );
    await storage.setBool(
      ethers.solidityPackedKeccak256(
        ['string', 'address'],
        ['EH:BridgeMiddleware:Officer:', await officer.getAddress()],
      ),
      true,
    );
    const v4PoolConfigs = [
      {
        id: 'EH:BridgeMiddleware:SwapManager:V4_USDC_USDT',
        currency0: USDC_ADDRESS,
        currency1: USDT_ADDRESS,
        fee: 8,
        tickSpacing: 1,
        hooks: '0x0000000000000000000000000000000000000000',
      },
      // ETH-USDT
      {
        id: 'EH:BridgeMiddleware:SwapManager:V4_ETH_USDT',
        currency0: ETH_ADDRESS,
        currency1: USDT_ADDRESS,
        fee: 500,
        tickSpacing: 10,
        hooks: '0x0000000000000000000000000000000000000000',
      },
    ];
    for (const pool of v4PoolConfigs) {
      const poolId = key(pool.id);
      const poolData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint24', 'int24', 'address'],
        [pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks],
      );
      await storage.setBytes(poolId, poolData);
    }
    const v3PoolConfigs = [
      {
        id: 'EH:BridgeMiddleware:SwapManager:V3_USDC_USDT',
        token0: USDC_ADDRESS,
        token1: USDT_ADDRESS,
        fee: 100, // 0.01% fee tier
      },
      {
        id: 'EH:BridgeMiddleware:SwapManager:V3_ETH_USDT',
        token0: WETH_ADDRESS, // WETH
        token1: USDT_ADDRESS,
        fee: 500, // 0.05% fee tier
      },
    ];
    for (const pool of v3PoolConfigs) {
      const poolId = key(pool.id);
      const poolData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint24'],
        [pool.token0, pool.token1, pool.fee],
      );
      await storage.setBytes(poolId, poolData);
    }
  }

  async function deployProxy(salt) {
    const receipt = await minimalProxyFactory
      .deploy(
        ethers.solidityPackedKeccak256(['string'], [salt]),
        await bridgeMiddleware.getAddress(),
        bridgeMiddleware.interface.encodeFunctionData('initialize', [
          await storage.getAddress(),
          await owner.getAddress(),
        ]),
      )
      .then((tx) => tx.wait());
    const proxyCreateEvent = receipt.logs.find((event) => event.fragment?.name === 'MinimalProxyCreated');
    expect(!!proxyCreateEvent).to.be.true;
    const proxyAddress = proxyCreateEvent.args[0];
    return new ethers.Contract(proxyAddress, bridgeMiddleware.interface, ethers.provider);
  }

  async function getTokensFromWhale(recipient, tokenAddress, amount) {
    const whaleAddress = whaleAddresses[tokenAddress];
    if (!whaleAddress) {
      throw new Error(`No whale address for token ${tokenAddress}`);
    }
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [whaleAddress],
    });
    await network.provider.send('hardhat_setBalance', [
      whaleAddress,
      '0x56bc75e2d63100000', // 100 ETH
    ]);
    const whale = await ethers.getSigner(whaleAddress);
    const token = await ethers.getContractAt('IERC20', tokenAddress);
    const whaleBalance = await token.balanceOf(whaleAddress);
    if (whaleBalance < amount) {
      throw new Error(`Whale doesn't have enough tokens. Has: ${whaleBalance}, needs: ${amount}`);
    }
    await token.connect(whale).transfer(recipient, amount);
    await network.provider.request({
      method: 'hardhat_stopImpersonatingAccount',
      params: [whaleAddress],
    });
    const receivedBalance = await token.balanceOf(recipient);
    return receivedBalance;
  }

  describe('Fork State Verification', function () {
    it('Should be connected to Arbitrum fork', async function () {
      const usdcDecimals = await usdc.decimals();
      const usdtDecimals = await usdt.decimals();
      const usdcSymbol = await usdc.symbol();
      const usdtSymbol = await usdt.symbol();
      expect(usdcDecimals).to.equal(6);
      expect(usdtDecimals).to.equal(6);
      expect(usdcSymbol).to.equal('USDC');
      expect(usdtSymbol).to.equal('USD₮0');
    });

    it('Should have access to whale accounts', async function () {
      const usdcBalance = await usdc.balanceOf(whaleAddresses[USDC_ADDRESS]);
      const usdtBalance = await usdt.balanceOf(whaleAddresses[USDT_ADDRESS]);
      expect(usdcBalance).to.be.greaterThan(0);
      expect(usdtBalance).to.be.greaterThan(0);
    });
  });

  describe('Real tokens operations', async function () {
    it('Should handle deposits', async function () {
      const salt = 'integration-usdc-deposit';
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      // Get real USDC tokens
      const usdcAmount = ethers.parseUnits('1000', 6);
      await getTokensFromWhale(await owner.getAddress(), USDC_ADDRESS, usdcAmount);
      // Transfer USDC to proxy
      await usdc.connect(owner).transfer(proxyAddress, usdcAmount);
      const proxyBalance = await usdc.balanceOf(proxyAddress);
      expect(proxyBalance).to.equal(usdcAmount);
      // Prepare deposit parameters
      const commitmentId = 12345;
      const depositData = dvfDeposit.interface.encodeFunctionData('depositWithId', [
        USDC_ADDRESS,
        usdcAmount,
        commitmentId,
      ]);
      const depositParams = {
        depositType: ethers.id('DVF'),
        token: USDC_ADDRESS,
        amount: usdcAmount,
        depositData,
        overrideData: false,
      };
      // Execute deposit
      const tx = await proxy.connect(depositor).deposit(depositParams);
      await expect(tx)
        .to.emit(proxy, 'Deposit')
        .withArgs(USDC_ADDRESS, usdcAmount)
        .to.emit(dvfDeposit, 'BridgedDepositWithId');
    });

    it('Should handle ETH deposits', async function () {
      const salt = 'integration-eth-deposit';
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      const ethAmount = ethers.parseEther('0.1');
      await owner.sendTransaction({
        to: proxyAddress,
        value: ethAmount,
      });
      const proxyBalance = await ethers.provider.getBalance(proxyAddress);
      expect(proxyBalance).to.equal(ethAmount);
      // Prepare deposit parameters
      const commitmentId = 67890;
      const depositData = dvfDeposit.interface.encodeFunctionData('depositNativeWithId', [commitmentId]);
      const depositParams = {
        depositType: ethers.id('DVF'),
        token: zeroAddress,
        amount: ethAmount,
        depositData,
        overrideData: false,
      };
      // Execute deposit
      const tx = await proxy.connect(depositor).deposit(depositParams);
      await expect(tx).to.emit(proxy, 'Deposit').withArgs(zeroAddress, ethAmount);
    });

    it('Should perform USDC to USDT swap using Uniswap v4', async function () {
      const salt = 'integration-usdc-usdt-swap';
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      // Get real USDC tokens
      const usdcAmountIn = ethers.parseUnits('100', 6); // 100 USDC
      await getTokensFromWhale(proxyAddress, USDC_ADDRESS, usdcAmountIn);
      // Prepare swap data
      const poolId = 'EH:BridgeMiddleware:SwapManager:V4_USDC_USDT';
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [key(poolId)]);
      const minAmountOut = ethers.parseUnits('95', 6); // Expect at least 95 USDT (5% slippage)
      const swapParams = {
        swapType: ethers.keccak256(ethers.toUtf8Bytes('UNISWAP_V4')),
        tokenIn: USDC_ADDRESS,
        amountIn: usdcAmountIn,
        minAmountOut: minAmountOut,
        swapData,
      };
      const beforeUsdcBalance = await usdc.balanceOf(proxyAddress);
      expect(beforeUsdcBalance).to.equal(usdcAmountIn);

      await expect(proxy.connect(depositor).swap(swapParams)).to.emit(proxy, 'Swap');
      const afterUsdtBalance = await usdt.balanceOf(proxyAddress);
      expect(afterUsdtBalance).greaterThanOrEqual(minAmountOut);
    });

    it('Should perform ETH to USDT swap using Uniswap v4', async function () {
      const salt = 'integration-eth-usdt-swap';
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      const ethAmountIn = ethers.parseEther('1');
      await owner.sendTransaction({
        to: proxyAddress,
        value: ethAmountIn,
      });

      // Prepare swap data
      const poolId = 'EH:BridgeMiddleware:SwapManager:V4_ETH_USDT';
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [ethers.id(poolId)]);

      const minUsdtOut = ethers.parseUnits('1500', 6); // Expect at least 1500 USDT

      const swapParams = {
        swapType: ethers.keccak256(ethers.toUtf8Bytes('UNISWAP_V4')),
        tokenIn: zeroAddress, // ETH
        amountIn: ethAmountIn,
        minAmountOut: minUsdtOut,
        swapData,
      };

      const beforeEthBalance = await ethers.provider.getBalance(proxyAddress);
      expect(beforeEthBalance).to.equal(ethAmountIn);
      await expect(proxy.connect(depositor).swap(swapParams)).to.emit(proxy, 'Swap');
      const afterUsdtBalance = await usdt.balanceOf(proxyAddress);
      expect(afterUsdtBalance).greaterThanOrEqual(minUsdtOut);
    });

    it('Should perform USDT to ETH swap using Uniswap v4', async function () {
      const salt = 'integration-usdt-eth-swap-v4';
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      const usdtAmountIn = ethers.parseUnits('2000', 6); // 2000 USDT
      await getTokensFromWhale(proxyAddress, USDT_ADDRESS, usdtAmountIn);
      // Prepare V4 swap data
      const poolId = 'EH:BridgeMiddleware:SwapManager:V4_ETH_USDT';
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [key(poolId)]);
      const minEthOut = ethers.parseEther('0.8'); // Expect at least 0.8 ETH
      const swapParams = {
        swapType: ethers.keccak256(ethers.toUtf8Bytes('UNISWAP_V4')),
        tokenIn: USDT_ADDRESS,
        amountIn: usdtAmountIn,
        minAmountOut: minEthOut,
        swapData,
      };
      const beforeUsdtBalance = await usdt.balanceOf(proxyAddress);
      expect(beforeUsdtBalance).to.equal(usdtAmountIn);
      await expect(proxy.connect(depositor).swap(swapParams))
        .to.emit(proxy, 'Swap')
        .withArgs(USDT_ADDRESS, zeroAddress, usdtAmountIn, anyValue);
      const afterEthBalance = await ethers.provider.getBalance(proxyAddress);
      expect(afterEthBalance).to.be.greaterThanOrEqual(minEthOut);
      // Verify USDT was consumed
      expect(await usdt.balanceOf(proxyAddress)).to.equal(0);
    });

    it('Should perform USDC to USDT swap using Uniswap V3', async function () {
      const salt = 'integration-usdc-usdt-swap-v3';
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      const usdcAmountIn = ethers.parseUnits('100', 6);
      await getTokensFromWhale(proxyAddress, USDC_ADDRESS, usdcAmountIn);
      // Prepare V3 swap data
      const poolId = 'EH:BridgeMiddleware:SwapManager:V3_USDC_USDT';
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [key(poolId)]);
      const minAmountOut = ethers.parseUnits('95', 6); // Expect at least 95 USDT (5% slippage)
      const swapParams = {
        swapType: ethers.keccak256(ethers.toUtf8Bytes('UNISWAP_V3')),
        tokenIn: USDC_ADDRESS,
        amountIn: usdcAmountIn,
        minAmountOut: minAmountOut,
        swapData,
      };
      const beforeUsdcBalance = await usdc.balanceOf(proxyAddress);
      expect(beforeUsdcBalance).to.equal(usdcAmountIn);
      await expect(proxy.connect(depositor).swap(swapParams))
        .to.emit(proxy, 'Swap')
        .withArgs(USDC_ADDRESS, USDT_ADDRESS, usdcAmountIn, anyValue);
      const afterUsdtBalance = await usdt.balanceOf(proxyAddress);
      expect(afterUsdtBalance).to.be.greaterThanOrEqual(minAmountOut);
      // Verify USDC was consumed
      expect(await usdc.balanceOf(proxyAddress)).to.equal(0);
    });

    it('Should perform ETH to USDT swap using Uniswap V3', async function () {
      const salt = 'integration-eth-usdt-swap-v3';
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      const ethAmountIn = ethers.parseEther('1');
      await owner.sendTransaction({
        to: proxyAddress,
        value: ethAmountIn,
      });
      // Prepare V3 swap data
      const poolId = 'EH:BridgeMiddleware:SwapManager:V3_ETH_USDT';
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [key(poolId)]);
      const minUsdtOut = ethers.parseUnits('1500', 6); // Expect at least 1500 USDT
      const swapParams = {
        swapType: ethers.keccak256(ethers.toUtf8Bytes('UNISWAP_V3')),
        tokenIn: zeroAddress, // ETH
        amountIn: ethAmountIn,
        minAmountOut: minUsdtOut,
        swapData,
      };
      const beforeEthBalance = await ethers.provider.getBalance(proxyAddress);
      expect(beforeEthBalance).to.equal(ethAmountIn);
      await expect(proxy.connect(depositor).swap(swapParams))
        .to.emit(proxy, 'Swap')
        .withArgs(zeroAddress, USDT_ADDRESS, ethAmountIn, anyValue);
      const afterUsdtBalance = await usdt.balanceOf(proxyAddress);
      expect(afterUsdtBalance).to.be.greaterThanOrEqual(minUsdtOut);
      // Verify ETH was consumed
      expect(await ethers.provider.getBalance(proxyAddress)).to.equal(0);
    });

    it('Should perform USDT to ETH swap using Uniswap V3', async function () {
      const salt = 'integration-usdt-eth-swap-v3';
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      const usdtAmountIn = ethers.parseUnits('2000', 6); // 2000 USDT
      await getTokensFromWhale(proxyAddress, USDT_ADDRESS, usdtAmountIn);
      // Prepare V3 swap data
      const poolId = 'EH:BridgeMiddleware:SwapManager:V3_ETH_USDT';
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [key(poolId)]);
      const minEthOut = ethers.parseEther('0.8'); // Expect at least 0.8 ETH
      const swapParams = {
        swapType: ethers.keccak256(ethers.toUtf8Bytes('UNISWAP_V3')),
        tokenIn: USDT_ADDRESS,
        amountIn: usdtAmountIn,
        minAmountOut: minEthOut,
        swapData,
      };
      const beforeUsdtBalance = await usdt.balanceOf(proxyAddress);
      expect(beforeUsdtBalance).to.equal(usdtAmountIn);
      await expect(proxy.connect(depositor).swap(swapParams))
        .to.emit(proxy, 'Swap')
        .withArgs(USDT_ADDRESS, zeroAddress, usdtAmountIn, anyValue);
      const afterEthBalance = await ethers.provider.getBalance(proxyAddress);
      expect(afterEthBalance).to.be.greaterThanOrEqual(minEthOut);
      // Verify USDT was consumed
      expect(await usdt.balanceOf(proxyAddress)).to.equal(0);
    });
  });
});
