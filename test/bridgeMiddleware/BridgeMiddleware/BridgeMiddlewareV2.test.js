'use strict';

const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const BN = require('big.js');

const key = (k) => ethers.keccak256(ethers.toUtf8Bytes(k));

describe('BridgeMiddlewareV2', function () {
  let owner, depositor, officer;
  let bridgeMiddleware, erc20, storage, minimalProxyFactory, weth;
  let depositManager, swapManager;
  let dvfDepositContract, defaultBridgeContract, mockRouter, permit2Mock;
  const zeroAddress = '0x0000000000000000000000000000000000000000';

  before(async function () {
    [owner, depositor, officer] = await ethers.getSigners();

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    erc20 = await ERC20Mock.deploy();
    const WETHMock = await ethers.getContractFactory('ERC20Mock');
    weth = await WETHMock.deploy();
    const DVFDepositContractMock = await ethers.getContractFactory('DVFDepositContractMock');
    dvfDepositContract = await DVFDepositContractMock.deploy();
    const DefaultBridgeMock = await ethers.getContractFactory('DefaultBridgeMock');
    defaultBridgeContract = await DefaultBridgeMock.deploy();
    const UniversalRouterMock = await ethers.getContractFactory('UniversalRouterMock');
    mockRouter = await UniversalRouterMock.deploy();
    const Permit2Mock = await ethers.getContractFactory('Permit2Mock');
    permit2Mock = await Permit2Mock.deploy();
    const Storage = await ethers.getContractFactory('Storage');
    storage = await Storage.deploy();

    const DepositManager = await ethers.getContractFactory('DepositManager');
    depositManager = await upgrades.deployProxy(DepositManager, [await storage.getAddress(), await owner.getAddress()]);
    const SwapManager = await ethers.getContractFactory('SwapManager');
    swapManager = await upgrades.deployProxy(SwapManager, [await storage.getAddress(), await owner.getAddress()], {
      constructorArgs: [await permit2Mock.getAddress(), await weth.getAddress()],
    });

    // Configure storage
    await storage.setAddress(key('EH:BridgeMiddleware:Bridge:DVF'), await dvfDepositContract.getAddress());
    await storage.setAddress(key('EH:BridgeMiddleware:Bridge:Default'), await defaultBridgeContract.getAddress());
    await storage.setAddress(key('EH:BridgeMiddleware:DepositManager'), await depositManager.getAddress());
    await storage.setAddress(key('EH:BridgeMiddleware:SwapManager'), await swapManager.getAddress());
    await storage.setAddress(key('EH:BridgeMiddleware:Swap:V4Router'), await mockRouter.getAddress());

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

    const BridgeMiddleware = await ethers.getContractFactory('BridgeMiddlewareV2');
    bridgeMiddleware = await BridgeMiddleware.deploy();
    const MinimalProxyFactory = await ethers.getContractFactory('MinimalProxyFactory');
    minimalProxyFactory = await MinimalProxyFactory.deploy(await storage.getAddress());
  });

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

  describe('Deposit tests', async function () {
    it('Should deposit ERC20 token', async function () {
      const salt = 'modular-erc20-deposit';
      const amount = new BN(1000).mul('1e18').toFixed(0);
      const commitmentId = 12345;
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      await erc20.mint(proxyAddress, amount);
      const depositData = dvfDepositContract.interface.encodeFunctionData('depositWithId', [
        await erc20.getAddress(),
        amount,
        commitmentId,
      ]);
      const depositParams = {
        depositType: ethers.id('DVF'),
        token: await erc20.getAddress(),
        amount,
        depositData,
      };
      await expect(proxy.connect(depositor).deposit(depositParams))
        .to.emit(proxy, 'Deposit')
        .withArgs(await erc20.getAddress(), amount)
        .to.emit(dvfDepositContract, 'BridgedDepositWithId')
        .withArgs(await depositManager.getAddress(), depositor.address, await erc20.getAddress(), amount, commitmentId);
      expect(await dvfDepositContract.getDepositCount()).to.equal(1);
      const deposit = await dvfDepositContract.getDeposit(0);
      expect(deposit.token).to.equal(await erc20.getAddress());
      expect(deposit.amount).to.equal(amount);
      expect(deposit.commitmentId).to.equal(commitmentId);
    });

    it('Should deposit native ETH', async function () {
      const salt = 'modular-eth-deposit';
      const amount = new BN(1).mul('1e18').toFixed(0);
      const commitmentId = 67890;
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      // Send ETH to proxy
      await owner.sendTransaction({
        to: proxyAddress,
        value: amount,
      });
      const depositData = dvfDepositContract.interface.encodeFunctionData('depositNativeWithId', [commitmentId]);
      const depositParams = {
        depositType: ethers.id('DVF'),
        token: zeroAddress,
        amount,
        depositData,
      };
      await expect(proxy.connect(depositor).deposit(depositParams))
        .to.emit(proxy, 'Deposit')
        .withArgs(zeroAddress, amount)
        .to.emit(dvfDepositContract, 'BridgedDepositWithId')
        .withArgs(await depositManager.getAddress(), depositor.address, zeroAddress, amount, commitmentId);
      expect(await dvfDepositContract.nativeTokenDepositAmount()).to.equal(amount);
    });

    it('Should handle DEFAULT deposit type', async function () {
      const salt = 'modular-default-deposit';
      const amount = new BN(500).mul('1e18').toFixed(0);
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      await erc20.mint(proxyAddress, amount);
      const depositData = defaultBridgeContract.interface.encodeFunctionData('outboundTransferCustomRefund', [
        await erc20.getAddress(), // _parentToken
        await depositor.getAddress(), // _refundTo
        await depositor.getAddress(), // _to
        amount, // _amount
        100000, // _maxGas
        1000000000, // _gasPriceBid (1 gwei)
        '0x', // _data
      ]);
      const depositParams = {
        depositType: ethers.id('DEFAULT'),
        token: await erc20.getAddress(),
        amount,
        depositData,
      };
      await expect(proxy.connect(depositor).deposit(depositParams))
        .to.emit(proxy, 'Deposit')
        .withArgs(await erc20.getAddress(), amount)
        .to.emit(defaultBridgeContract, 'OutboundTransferCustomRefund')
        .withArgs(
          await erc20.getAddress(),
          await depositor.getAddress(),
          await depositor.getAddress(),
          amount,
          100000,
          1000000000,
          '0x',
        );
    });

    it('Should revert if DepositManager not found', async function () {
      const salt = 'no-deposit-manager';
      const amount = new BN(100).mul('1e18').toFixed(0);
      const proxy = await deployProxy(salt);
      // Remove deposit manager from storage
      await storage.setAddress(key('EH:BridgeMiddleware:DepositManager'), zeroAddress);
      const depositParams = {
        depositType: ethers.id('DVF'),
        token: await erc20.getAddress(),
        amount,
        depositData: '0x',
      };
      await expect(proxy.connect(depositor).deposit(depositParams)).to.be.revertedWithCustomError(
        proxy,
        'ManagerNotFound',
      );
      // Restore deposit manager
      await storage.setAddress(key('EH:BridgeMiddleware:DepositManager'), await depositManager.getAddress());
    });

    it('Should revert for unsupported deposit type', async function () {
      const salt = 'unsupported-deposit';
      const amount = new BN(100).mul('1e18').toFixed(0);
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      await erc20.mint(proxyAddress, amount);
      const depositParams = {
        depositType: ethers.id('UNSUPPORTED'),
        token: await erc20.getAddress(),
        amount,
        depositData: '0x',
      };
      await expect(proxy.connect(depositor).deposit(depositParams)).to.be.revertedWithCustomError(
        depositManager,
        'UnsupportedDepositType',
      );
    });
  });

  describe('Swap tests', async function () {
    beforeEach(async function () {
      await mockRouter.setShouldFail(false);
    });

    it('Should swap ERC20 to ERC20', async function () {
      const salt = 'modular-erc20-swap';
      const amountIn = new BN(1000).mul('1e18').toFixed(0);
      const amountOut = new BN(2000).mul('1e18').toFixed(0);
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      // Setup tokens
      const ERC20Mock2 = await ethers.getContractFactory('ERC20Mock');
      const outputToken = await ERC20Mock2.deploy();
      // Mint input tokens to proxy
      await erc20.mint(proxyAddress, amountIn);
      // Mint output tokens to mock router
      await outputToken.mint(await mockRouter.getAddress(), amountOut);
      // Configure mock router
      await mockRouter.setSwapResult(await outputToken.getAddress(), amountOut);
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [ethers.id('pool1')]);
      // Store pool data
      const poolData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint24', 'int24', 'address'],
        [await erc20.getAddress(), await outputToken.getAddress(), 3000, 60, zeroAddress],
      );
      await storage.setBytes(ethers.id('pool1'), poolData);

      const swapParams = {
        swapType: ethers.id('UNISWAP_V4'),
        tokenIn: await erc20.getAddress(),
        amountIn,
        minAmountOut: amountOut,
        swapData,
      };

      await expect(proxy.connect(depositor).swap(swapParams))
        .to.emit(proxy, 'Swap')
        .withArgs(await erc20.getAddress(), await outputToken.getAddress(), amountIn, amountOut);

      // Verify tokens were transferred back to proxy
      expect(await outputToken.balanceOf(proxyAddress)).to.equal(amountOut);
    });

    it('Should swap ETH to ERC20', async function () {
      const salt = 'modular-eth-erc20-swap';
      const amountIn = new BN(1).mul('1e18').toFixed(0);
      const amountOut = new BN(2000).mul('1e18').toFixed(0);
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      // Setup output token
      const ERC20Mock2 = await ethers.getContractFactory('ERC20Mock');
      const outputToken = await ERC20Mock2.deploy();
      // Send ETH to proxy
      await owner.sendTransaction({
        to: proxyAddress,
        value: amountIn,
      });
      // Mint output tokens to mock router
      await outputToken.mint(await mockRouter.getAddress(), amountOut);
      await mockRouter.setSwapResult(await outputToken.getAddress(), amountOut);
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [ethers.id('ethPool')]);
      // Store pool data (ETH is address(0) for currency0)
      const poolData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint24', 'int24', 'address'],
        [zeroAddress, await outputToken.getAddress(), 3000, 60, zeroAddress],
      );
      await storage.setBytes(ethers.id('ethPool'), poolData);
      const swapParams = {
        swapType: ethers.id('UNISWAP_V4'),
        tokenIn: zeroAddress,
        amountIn,
        minAmountOut: amountOut,
        swapData,
      };
      await expect(proxy.connect(depositor).swap(swapParams))
        .to.emit(proxy, 'Swap')
        .withArgs(zeroAddress, await outputToken.getAddress(), amountIn, amountOut);
    });

    it('Should swap ERC20 to ETH', async function () {
      const salt = 'modular-erc20-eth-swap';
      const amountIn = new BN(2000).mul('1e18').toFixed(0);
      const amountOut = new BN(1).mul('1e18').toFixed(0);
      const proxy = await deployProxy(salt);
      // Mint input token to proxy
      await erc20.mint(await proxy.getAddress(), amountIn);
      // Send ETH to router
      await owner.sendTransaction({
        to: await mockRouter.getAddress(),
        value: amountOut,
      });
      await mockRouter.setSwapResult(zeroAddress, amountOut);
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [ethers.id('ethPool')]);
      // Store pool data (ETH is address(0) for currency0)
      const poolData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint24', 'int24', 'address'],
        [zeroAddress, await erc20.getAddress(), 3000, 60, zeroAddress],
      );
      await storage.setBytes(ethers.id('ethPool'), poolData);
      const swapParams = {
        swapType: ethers.id('UNISWAP_V4'),
        tokenIn: await erc20.getAddress(),
        amountIn,
        minAmountOut: amountOut,
        swapData,
      };
      await expect(proxy.connect(depositor).swap(swapParams))
        .to.emit(proxy, 'Swap')
        .withArgs(await erc20.getAddress(), zeroAddress, amountIn, amountOut);
    });

    it('Should revert if SwapManager not found', async function () {
      const salt = 'no-swap-manager';
      const proxy = await deployProxy(salt);
      // Remove swap manager from storage
      await storage.setAddress(key('EH:BridgeMiddleware:SwapManager'), zeroAddress);
      const swapParams = {
        swapType: ethers.id('UNISWAP_V4'),
        tokenIn: await erc20.getAddress(),
        amountIn: 1000,
        minAmountOut: 900,
        swapData: '0x',
      };
      await expect(proxy.connect(depositor).swap(swapParams)).to.be.revertedWithCustomError(proxy, 'ManagerNotFound');
      // Restore swap manager
      await storage.setAddress(key('EH:BridgeMiddleware:SwapManager'), await swapManager.getAddress());
    });

    it('Should revert for unsupported swap type', async function () {
      const salt = 'unsupported-swap';
      const proxy = await deployProxy(salt);
      const proxyAddress = await proxy.getAddress();
      await erc20.mint(proxyAddress, 1000);
      const swapParams = {
        swapType: ethers.id('UNSUPPORTED_DEX'),
        tokenIn: await erc20.getAddress(),
        amountIn: 1000,
        minAmountOut: 900,
        swapData: '0x',
      };
      await expect(proxy.connect(depositor).swap(swapParams)).to.be.revertedWithCustomError(
        swapManager,
        'UnsupportedSwapType',
      );
    });
  });
});
