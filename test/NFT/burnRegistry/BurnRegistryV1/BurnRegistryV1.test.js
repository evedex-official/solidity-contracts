const { expect } = require('chai');
const { ethers } = require('hardhat');
const BN = require('big.js');
const mockSeeds = require('../../../seeds/mock');

describe('BurnRegistryV1', function () {
  let owner, token, notOwner, distributor;
  const price = BN(1000).mul(1e8).toFixed(0);
  let burnRegistry;
  const recoverUSD = BN(3).mul(1e18).toFixed(0);
  const recoverETH = BN(recoverUSD).mul(1e8).div(price).toFixed(0);
  before(async function () {
    [owner, token, notOwner, distributor] = await ethers.getSigners();

    [priceFeed] = await mockSeeds.priceFeed({ decimals: 8 });
    await priceFeed.setRound(price);

    const BurnRegistryV1 = await ethers.getContractFactory(
      'contracts/NFT/burnRegistry/BurnRegistryV1.sol:BurnRegistryV1',
    );
    burnRegistry = await upgrades.deployProxy(
      BurnRegistryV1,
      [await token.getAddress(), await priceFeed.getAddress(), recoverUSD],
      {
        initializer: 'initialize',
        unsafeAllow: ['constructor'],
      },
    );
    await burnRegistry.addDistributor(await distributor.getAddress());
  });

  it('Should return recover ETH', async function () {
    expect(await burnRegistry.recoverETH()).to.equal(recoverETH);

    const newRecoverUSD = BN(5).mul(1e18).toFixed(0);
    await burnRegistry.changeRecover(newRecoverUSD);

    expect(await burnRegistry.recoverETH()).to.equal(BN(newRecoverUSD).mul(1e8).div(price).toFixed(0));

    await burnRegistry.changeRecover(recoverUSD);
  });

  it('Should register burn and recover ETH', async function () {
    const beforeBalance = await ethers.provider.getBalance(await notOwner.getAddress());

    expect(await burnRegistry.totalSupply()).to.equal(0);
    expect(await burnRegistry.burnedBy(0)).to.equal('0x0000000000000000000000000000000000000000');
    expect(await burnRegistry.burnedCount(await notOwner.getAddress())).to.equal(0);
    await owner.sendTransaction({
      to: await burnRegistry.getAddress(),
      value: recoverETH,
    });

    await expect(burnRegistry.connect(token).burn(await notOwner.getAddress(), 0))
      .to.emit(burnRegistry, 'Burned')
      .withArgs(await notOwner.getAddress(), 0, 0);

    expect(await burnRegistry.totalSupply()).to.equal(1);
    expect(await burnRegistry.burnedBy(0)).to.equal(await notOwner.getAddress());
    expect(await burnRegistry.burnedCount(await notOwner.getAddress())).to.equal(1);
    expect(await ethers.provider.getBalance(await notOwner.getAddress())).to.equal(
      BN(beforeBalance).plus(recoverETH).toFixed(0),
    );
  });

  it('Should revert transaction if not ETH for recover', async function () {
    await expect(burnRegistry.connect(token).burn(await notOwner.getAddress(), 1)).to.be.revertedWithCustomError(
      burnRegistry,
      'BurnRegistryTransferFailed',
    );
  });

  it('Should revert transaction if sender not token', async function () {
    await expect(burnRegistry.connect(owner).burn(await notOwner.getAddress(), 1)).to.be.revertedWithCustomError(
      burnRegistry,
      'BurnRegistryInvalidSender',
    );
  });

  it('Should withdraw ETH', async function () {
    const value = BN(10).mul(1e18).toFixed(0);
    await owner.sendTransaction({
      to: await burnRegistry.getAddress(),
      value: value,
    });

    const beforeBalance = await ethers.provider.getBalance(await notOwner.getAddress());

    await expect(burnRegistry.connect(owner).withdrawCrumbs(await notOwner.getAddress(), value))
      .to.emit(burnRegistry, 'Withdrawal')
      .withArgs(await notOwner.getAddress(), value);
    expect(await ethers.provider.getBalance(await notOwner.getAddress())).to.equal(
      BN(beforeBalance).plus(value).toFixed(0),
    );
  });

  it('Should register winner', async function () {
    expect(await burnRegistry.isWinner(await owner.getAddress())).to.equal(false);

    await expect(burnRegistry.connect(distributor).winner(await owner.getAddress()))
      .to.emit(burnRegistry, 'Winner')
      .withArgs(await owner.getAddress());

    expect(await burnRegistry.isWinner(await owner.getAddress())).to.equal(true);
  });

  it('Should revert transaction if call not distributor', async function () {
    await expect(burnRegistry.connect(owner).winner(await notOwner.getAddress())).to.be.revertedWithCustomError(
      burnRegistry,
      'BurnRegistryInvalidDistributor',
    );
  });
});
