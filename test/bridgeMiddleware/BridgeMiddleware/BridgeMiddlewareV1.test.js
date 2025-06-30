const { expect } = require('chai');
const { ethers } = require('hardhat');
const BN = require('big.js');

const key = (k) => ethers.keccak256(ethers.toUtf8Bytes(k));

describe('BridgeMiddleware DVF Deposits', function () {
  let owner, depositor, recipient;
  let bridgeMiddleware, erc20, storage, minimalProxyFactory, dvfDepositContract;
  const zeroAddress = '0x0000000000000000000000000000000000000000';

  before(async function () {
    [owner, depositor, recipient] = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory('contracts/mock/ERC20Mock.sol:ERC20Mock');
    erc20 = await ERC20.deploy();
    const DVFDepositContract = await ethers.getContractFactory(
      'contracts/mock/DVFDepositContractMock.sol:DVFDepositContractMock',
    );
    dvfDepositContract = await DVFDepositContract.deploy();
    const Storage = await ethers.getContractFactory('contracts/storage/Storage.sol:Storage');
    storage = await Storage.deploy();
    await storage.setAddress(key('EH:BridgeMiddleware:Bridge:DVF'), await dvfDepositContract.getAddress());
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
    const BridgeMiddleware = await ethers.getContractFactory(
      'contracts/bridgeMiddleware/BridgeMiddlewareV1.sol:BridgeMiddlewareV1',
    );
    bridgeMiddleware = await BridgeMiddleware.deploy();

    const MinimalProxyFactory = await ethers.getContractFactory(
      'contracts/bridgeMiddleware/MinimalProxyFactory.sol:MinimalProxyFactory',
    );
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
    expect(!!proxyCreateEvent).to.true;
    const proxyAddress = proxyCreateEvent.args[0];
    return new ethers.Contract(proxyAddress, bridgeMiddleware.interface, ethers.provider);
  }

  it('Should deposit ERC20 token using depositWithId', async function () {
    const salt = 'dvf-deposit-erc20';
    const amount = new BN(1).mul('1e18').toFixed(0);
    const commitmentId = 12345;
    const proxy = await deployProxy(salt);
    const proxyAddress = await proxy.getAddress();
    await erc20.mint(proxyAddress, amount);
    // Encode depositWithId function call
    const data = dvfDepositContract.interface.encodeFunctionData('depositWithId', [
      await erc20.getAddress(),
      amount,
      commitmentId,
    ]);

    await expect(proxy.connect(depositor).depositDVF(await erc20.getAddress(), amount, data))
      .to.emit(proxy, 'Deposit')
      .withArgs(await erc20.getAddress(), amount)
      .to.emit(dvfDepositContract, 'BridgedDepositWithId')
      .withArgs(proxyAddress, depositor.address, await erc20.getAddress(), amount, commitmentId);

    // Verify deposit was recorded in mock
    expect(await dvfDepositContract.getDepositCount()).to.equal(1);
    const deposit = await dvfDepositContract.getDeposit(0);
    expect(deposit.sender).to.equal(proxyAddress);
    expect(deposit.token).to.equal(await erc20.getAddress());
    expect(deposit.amount).to.equal(amount);
    expect(deposit.commitmentId).to.equal(commitmentId);
  });

  it('Should deposit native token using depositNativeWithId', async function () {
    const salt = 'dvf-deposit-native';
    const amount = new BN(1).mul('1e18').toFixed(0);
    const commitmentId = 67890;
    const proxy = await deployProxy(salt);
    const proxyAddress = await proxy.getAddress();
    await owner.sendTransaction({
      to: proxyAddress,
      value: amount,
    });

    const data = dvfDepositContract.interface.encodeFunctionData('depositNativeWithId', [commitmentId]);

    await expect(
      proxy.connect(depositor).depositDVF(
        zeroAddress,
        amount,
        data,
        { value: 0 }, // No need to send ETH with the call as we're using proxy's balance
      ),
    )
      .to.emit(proxy, 'Deposit')
      .withArgs(zeroAddress, amount)
      .to.emit(dvfDepositContract, 'BridgedDepositWithId')
      .withArgs(proxyAddress, depositor.address, zeroAddress, amount, commitmentId);

    // Verify deposit was recorded in mock
    expect(await dvfDepositContract.getDepositCount()).to.equal(2); // Second deposit
    const deposit = await dvfDepositContract.getDeposit(1);
    expect(deposit.sender).to.equal(proxyAddress);
    expect(deposit.token).to.equal(zeroAddress);
    expect(deposit.amount).to.equal(amount);
    expect(deposit.commitmentId).to.equal(commitmentId);
    expect(await dvfDepositContract.nativeTokenDepositAmount()).to.equal(amount);
  });

  it('Should revert if bridge not found', async function () {
    const salt = 'dvf-bridge-not-found';
    const amount = new BN(1).mul('1e18').toFixed(0);
    const commitmentId = 12345;
    const proxy = await deployProxy(salt);
    const proxyAddress = await proxy.getAddress();
    await erc20.mint(proxyAddress, amount);
    await storage.setAddress(key('EH:BridgeMiddleware:Bridge:DVF'), zeroAddress);
    const data = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes4', 'address', 'uint256', 'uint256'],
      [
        dvfDepositContract.interface.getFunction('depositWithId').selector,
        await erc20.getAddress(),
        amount,
        commitmentId,
      ],
    );
    await expect(
      proxy.connect(depositor).depositDVF(await erc20.getAddress(), amount, data),
    ).to.be.revertedWithCustomError(proxy, 'BridgeNotFound');

    await storage.setAddress(key('EH:BridgeMiddleware:Bridge:DVF'), await dvfDepositContract.getAddress());
  });

  it('Should revert if deposit fails', async function () {
    const salt = 'dvf-deposit-fails';
    const amount = new BN(1).mul('1e18').toFixed(0);
    const commitmentId = 12345;
    const proxy = await deployProxy(salt);
    const proxyAddress = await proxy.getAddress();
    await erc20.mint(proxyAddress, amount);
    // Set deposits to fail in the mock
    await dvfDepositContract.setDepositsDisallowed(true);
    const data = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes4', 'address', 'uint256', 'uint256'],
      [
        dvfDepositContract.interface.getFunction('depositWithId').selector,
        await erc20.getAddress(),
        amount,
        commitmentId,
      ],
    );
    await expect(
      proxy.connect(depositor).depositDVF(await erc20.getAddress(), amount, data),
    ).to.be.revertedWithCustomError(proxy, 'DepositFailed');
    await dvfDepositContract.setDepositsDisallowed(false);
  });
});
