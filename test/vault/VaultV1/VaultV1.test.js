const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const mockSeeds = require('../../seeds/mock');

describe('Vault', function () {
  let owner, notOwner;
  let vault;
  const distributedAmount = '1.0';
  before(async function () {
    [owner, notOwner] = await ethers.getSigners();

    const VaultV1 = await ethers.getContractFactory('contracts/vault/VaultV1.sol:VaultV1');
    vault = await upgrades.deployProxy(VaultV1, [], {
      initializer: 'initialize',
      unsafeAllow: ['constructor'],
    });
  });

  it('Should receive tokens', async function () {
    expect(await ethers.provider.getBalance(vault.target)).to.equal(0n);

    await owner.sendTransaction({
      to: vault.target,
      value: ethers.parseEther(distributedAmount),
    });

    const balance = await ethers.provider.getBalance(vault.target).then((v) => ethers.formatEther(v));
    expect(balance).to.equal(distributedAmount);
  });

  it('Should distribute commission', async function () {
    const balance = await ethers.provider.getBalance(vault.target);
    expect(balance).to.gt(0n);
    expect(await vault.totalDistributed()).to.equal(0n, 'Invalid initial total distributed');
    expect(await vault.balanceOf(notOwner)).to.equal(0n, 'Invalid initial distributed');

    await expect(vault.connect(owner).distribute(notOwner.address, balance))
      .to.emit(vault, 'Distribute')
      .withArgs(notOwner.address, balance);
    expect(await vault.totalDistributed()).to.equal(balance, 'Invalid total distributed');
    expect(await vault.balanceOf(notOwner)).to.equal(balance, 'Invalid distributed balance');
  });

  it('Should revert transaction if distribution overflow', async function () {
    const totalDistributed = await vault.totalDistributed();
    const distributedBalance = await vault.balanceOf(notOwner);
    expect(totalDistributed).to.equal(distributedBalance, 'Invalid initial total distributed');

    await expect(vault.distribute(notOwner.address, distributedBalance)).to.be.revertedWithCustomError(
      vault,
      'VaultDistributeOverflow',
    );
  });

  it('Should revert withdraw if contract paused', async function () {
    await expect(vault.pause()).to.emit(vault, 'Paused');

    await expect(vault.connect(notOwner).withdraw()).to.be.revertedWithCustomError(vault, 'EnforcedPause');

    await expect(vault.unpause()).to.emit(vault, 'Unpaused');
  });

  it('Should withdraw distributed commission', async function () {
    const accountBalance = await ethers.provider.getBalance(notOwner.address);
    const distributedBalance = await vault.balanceOf(notOwner.address);

    await expect(
      vault.connect(notOwner).withdraw({
        gasPrice: 0,
      }),
    )
      .to.emit(vault, 'Withdrawal')
      .withArgs(notOwner.address, notOwner.address, distributedBalance);

    expect(await vault.balanceOf(notOwner.address)).to.equal(0n, 'Invalid distributed balance');
    expect(await vault.totalDistributed()).to.equal(0n, 'Invalid total distributed');
    expect(await ethers.provider.getBalance(notOwner.address)).to.equal(accountBalance + distributedBalance);
  });

  it('Should revert withdraw from if contract not paused', async function () {
    await expect(vault.withdrawFrom(notOwner.address, owner.address)).to.be.revertedWithCustomError(
      vault,
      'ExpectedPause',
    );
  });

  it('Should withdraw from', async function () {
    const distributedAmount = ethers.parseEther('1.0');

    await vault.pause();
    await expect(vault.distribute(notOwner.address, distributedAmount, { value: distributedAmount }))
      .to.emit(vault, 'Distribute')
      .withArgs(notOwner.address, distributedAmount);
    expect(await vault.balanceOf(notOwner.address)).to.equal(distributedAmount, 'Invalid distributed balance');
    expect(await vault.balanceOf(owner.address)).to.equal(0n, 'Invalid owner balance');

    const ownerBalanceBeforeWithdraw = await ethers.provider.getBalance(owner.address);
    await expect(vault.withdrawFrom(notOwner.address, owner.address, { gasPrice: 0 }))
      .to.emit(vault, 'Withdrawal')
      .withArgs(notOwner.address, owner.address, distributedAmount);
    expect(await ethers.provider.getBalance(owner.address)).to.equal(
      ownerBalanceBeforeWithdraw + distributedAmount,
      'Invalid withdraw balance',
    );
    await vault.unpause();
  });

  it('Should withdraw crumbs', async function () {
    const vaultBalance = '1.0';
    const distributedAmount = '0.42';

    await owner.sendTransaction({
      to: vault.target,
      value: ethers.parseEther(vaultBalance),
    });
    await expect(vault.distribute(notOwner.address, ethers.parseEther(distributedAmount)))
      .to.emit(vault, 'Distribute')
      .withArgs(notOwner.address, ethers.parseEther(distributedAmount));

    const ownerBalanceBeforeWithdraw = await ethers.provider.getBalance(owner.address);
    await expect(vault.withdrawCrumbs(owner.address, { gasPrice: 0 }))
      .to.emit(vault, 'Withdrawal')
      .withArgs(vault.target, owner.address, ethers.parseEther(vaultBalance) - ethers.parseEther(distributedAmount));
    expect(await ethers.provider.getBalance(owner.address)).to.equal(
      ownerBalanceBeforeWithdraw + ethers.parseEther(vaultBalance) - ethers.parseEther(distributedAmount),
      'Invalid withdraw balance',
    );
  });
});
