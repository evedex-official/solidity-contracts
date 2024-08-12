const { expect } = require('chai');
const { ethers } = require('hardhat');
const BN = require('big.js');

describe('MinimalProxyFactory', function () {
  let owner;
  let minimalProxyFactory, bridgeMiddleware, erc20;
  const zeroAddress = '0x0000000000000000000000000000000000000000';

  before(async function () {
    [owner] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory('contracts/mock/ERC20Mock.sol:ERC20Mock');
    erc20 = await ERC20.deploy();

    const MinimalProxyFactory = await ethers.getContractFactory(
      'contracts/bridgeMiddleware/MinimalProxyFactory.sol:MinimalProxyFactory',
    );
    minimalProxyFactory = await MinimalProxyFactory.deploy();

    const BridgeMiddleware = await ethers.getContractFactory(
      'contracts/bridgeMiddleware/BridgeMiddleware.sol:BridgeMiddleware',
    );
    bridgeMiddleware = await BridgeMiddleware.deploy();
  });

  describe('computeAddress', function () {
    it('Should return determinate address', async function () {
      const salt = '123';

      const proxyAddress1 = await minimalProxyFactory.computeAddress(
        ethers.solidityPackedKeccak256(['string'], [salt]),
        await bridgeMiddleware.getAddress(),
      );
      const proxyAddress2 = await minimalProxyFactory.computeAddress(
        ethers.solidityPackedKeccak256(['string'], [salt]),
        await bridgeMiddleware.getAddress(),
      );

      expect(proxyAddress1).to.equal(proxyAddress2);
    });
  });

  describe('deploy', function () {
    it('Should create proxy minimal with initialization', async function () {
      const salt = 'empty balance';

      const receipt = await minimalProxyFactory
        .deploy(
          ethers.solidityPackedKeccak256(['string'], [salt]),
          await bridgeMiddleware.getAddress(),
          bridgeMiddleware.interface.encodeFunctionData('initialize', [zeroAddress, await owner.getAddress()]),
        )
        .then((tx) => tx.wait());
      const proxyCreateEvent = receipt.logs.find((event) => event.fragment?.name === 'MinimalProxyCreated');
      expect(!!proxyCreateEvent).to.true;
      const minimalProxyAddress = proxyCreateEvent.args[0];
      const minimalProxy = new ethers.Contract(minimalProxyAddress, bridgeMiddleware.interface, ethers.provider);

      expect(await minimalProxy.info()).to.equal(zeroAddress);
      expect(await minimalProxy.owner()).to.equal(await owner.getAddress());
    });
    it('Should create proxy minimal on address with balance', async function () {
      const salt = 'with balance';
      const ethBalance = new BN(1).mul('1e18').toFixed(0);
      const ercBalance = new BN(1).mul('1e18').toFixed(0);

      const proxyAddress = await minimalProxyFactory.computeAddress(
        ethers.solidityPackedKeccak256(['string'], [salt]),
        await bridgeMiddleware.getAddress(),
      );
      await owner.sendTransaction({
        to: proxyAddress,
        value: ethBalance,
      });
      erc20.connect(owner).mint(proxyAddress, ercBalance);

      const receipt = await minimalProxyFactory
        .deploy(
          ethers.solidityPackedKeccak256(['string'], [salt]),
          await bridgeMiddleware.getAddress(),
          bridgeMiddleware.interface.encodeFunctionData('initialize', [zeroAddress, await owner.getAddress()]),
        )
        .then((tx) => tx.wait());
      const proxyCreateEvent = receipt.logs.find((event) => event.fragment?.name === 'MinimalProxyCreated');
      expect(!!proxyCreateEvent).to.true;
      const proxyAddress2 = proxyCreateEvent.args[0];

      expect(proxyAddress2).to.equal(proxyAddress);
      expect(await ethers.provider.getBalance(proxyAddress2).then((v) => v.toString())).to.equal(ethBalance);
      expect(await erc20.balanceOf(proxyAddress2).then((v) => v.toString())).to.equal(ercBalance);
    });
  });
});
