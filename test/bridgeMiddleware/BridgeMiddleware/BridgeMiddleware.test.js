const { expect } = require('chai');
const { ethers } = require('hardhat');
const BN = require('big.js');

const key = (k) => ethers.keccak256(ethers.toUtf8Bytes(k));

describe('BridgeMiddleware', function () {
  let owner, depositor, recipient;
  let bridgeMiddleware, erc20, acrossSpokePool, storage, minimalProxyFactory;
  const zeroAddress = '0x0000000000000000000000000000000000000000';

  before(async function () {
    [owner, depositor, recipient] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory('contracts/mock/ERC20Mock.sol:ERC20Mock');
    erc20 = await ERC20.deploy();

    const AcrossSpokePool = await ethers.getContractFactory(
      'contracts/mock/AcrossSpokePoolMock.sol:AcrossSpokePoolMock',
    );
    acrossSpokePool = await AcrossSpokePool.deploy();

    const Storage = await ethers.getContractFactory('contracts/storage/Storage.sol:Storage');
    storage = await Storage.deploy();
    await storage.setAddress(key('EH:BridgeMiddleware:Bridge'), await acrossSpokePool.getAddress());
    await storage.setBool(
      ethers.solidityPackedKeccak256(
        ['string', 'address'],
        ['EH:BridgeMiddleware:Depositor:', await depositor.getAddress()],
      ),
      true,
    );

    const BridgeMiddleware = await ethers.getContractFactory(
      'contracts/bridgeMiddleware/BridgeMiddleware.sol:BridgeMiddleware',
    );
    bridgeMiddleware = await BridgeMiddleware.deploy();

    const MinimalProxyFactory = await ethers.getContractFactory(
      'contracts/bridgeMiddleware/MinimalProxyFactory.sol:MinimalProxyFactory',
    );
    minimalProxyFactory = await MinimalProxyFactory.deploy();
  });

  it('Should deposit eth', async function () {
    const salt = 'test eth';
    const amount = new BN(1).mul('1e18').toFixed(0);
    const recipientBalanceBefore = await ethers.provider
      .getBalance(await recipient.getAddress())
      .then((v) => v.toString());

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
    const proxy = new ethers.Contract(proxyAddress, bridgeMiddleware.interface, ethers.provider);
    await owner.sendTransaction({
      to: proxyAddress,
      value: amount,
    });

    await expect(
      proxy
        .connect(depositor)
        .deposit(
          zeroAddress,
          amount,
          acrossSpokePool.interface.encodeFunctionData('depositV3', [
            zeroAddress,
            await recipient.getAddress(),
            zeroAddress,
            zeroAddress,
            amount,
            0,
            0,
            zeroAddress,
            0,
            0,
            0,
            ethers.toUtf8Bytes(''),
          ]),
        ),
    )
      .to.emit(proxy, 'Deposit')
      .withArgs(zeroAddress, amount);

    const actualBalance = await ethers.provider.getBalance(await recipient.getAddress()).then((v) => v.toString());
    expect(new BN(recipientBalanceBefore).plus(amount).toFixed(0)).to.equal(actualBalance);
  });

  it('Should deposit erc', async function () {
    const salt = 'test erc';
    const amount = new BN(1).mul('1e18').toFixed(0);
    const recipientBalanceBefore = await erc20.balanceOf(await recipient.getAddress()).then((v) => v.toString());

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
    const proxy = new ethers.Contract(proxyAddress, bridgeMiddleware.interface, ethers.provider);
    await erc20.mint(proxyAddress, amount);

    await expect(
      proxy
        .connect(depositor)
        .deposit(
          await erc20.getAddress(),
          amount,
          acrossSpokePool.interface.encodeFunctionData('depositV3', [
            zeroAddress,
            await recipient.getAddress(),
            await erc20.getAddress(),
            zeroAddress,
            amount,
            0,
            0,
            zeroAddress,
            0,
            0,
            0,
            ethers.toUtf8Bytes(''),
          ]),
        ),
    )
      .to.emit(proxy, 'Deposit')
      .withArgs(await erc20.getAddress(), amount);

    const actualBalance = await erc20.balanceOf(await recipient.getAddress()).then((v) => v.toString());
    expect(new BN(recipientBalanceBefore).plus(amount).toFixed(0)).to.equal(actualBalance);
  });

  it('Should revert tx if call not depositor', async function () {
    const salt = 'test revert';
    const amount = new BN(1).mul('1e18').toFixed(0);
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
    const proxy = new ethers.Contract(proxyAddress, bridgeMiddleware.interface, ethers.provider);
    await erc20.mint(proxyAddress, amount);

    await expect(
      proxy
        .connect(owner)
        .deposit(
          await erc20.getAddress(),
          amount,
          acrossSpokePool.interface.encodeFunctionData('depositV3', [
            zeroAddress,
            await recipient.getAddress(),
            await erc20.getAddress(),
            zeroAddress,
            amount,
            0,
            0,
            zeroAddress,
            0,
            0,
            0,
            ethers.toUtf8Bytes(''),
          ]),
        ),
    ).to.be.revertedWithCustomError(proxy, 'Forbidden');
  });
});
