const { expect } = require('chai');
const { ZeroAddress } = require('ethers');
const { ethers, upgrades } = require('hardhat');

const key = (k) => ethers.keccak256(ethers.toUtf8Bytes(k));

describe('VaultV2', function () {
  let owner, distributor, notOwner;
  let vault, storage, token;
  const nativeTokenAddress = ZeroAddress;
  const distributedAmount = '1.0';
  before(async function () {
    [owner, distributor, notOwner] = await ethers.getSigners();

    const ERC20 = await ethers.getContractFactory('contracts/mock/ERC20Mock.sol:ERC20Mock');
    token = await ERC20.deploy();

    const Storage = await ethers.getContractFactory('contracts/storage/Storage.sol:Storage');
    storage = await Storage.deploy();
    await storage.setBool(
      ethers.solidityPackedKeccak256(
        ['string', 'address'],
        ['EH:PartnerVault:Distributor:', await distributor.getAddress()],
      ),
      true,
    );

    const VaultV2 = await ethers.getContractFactory('contracts/vault/VaultV2.sol:VaultV2');
    vault = await upgrades.deployProxy(VaultV2, [await storage.getAddress()], {
      initializer: 'initialize',
      unsafeAllow: ['constructor'],
    });
  });

  it('Should receive native token', async function () {
    const amount = '1.0';
    expect(await ethers.provider.getBalance(vault.target)).to.equal(0n);

    await owner.sendTransaction({
      to: vault.target,
      value: ethers.parseEther(amount),
    });

    const balance = await ethers.provider.getBalance(vault.target).then((v) => ethers.formatEther(v));
    expect(amount).to.equal(balance);
  });

  it('Should revert transaction if call not distributor', async function () {
    await expect(
      vault.connect(owner).distribute(await token.getAddress(), notOwner.address, 0),
    ).to.be.revertedWithCustomError(vault, 'Forbidden');

    await expect(
      vault.connect(owner).distribute(nativeTokenAddress, notOwner.address, 0),
    ).to.be.revertedWithCustomError(vault, 'Forbidden');
  });

  it('Should distribute native token', async function () {
    const balance = await ethers.provider.getBalance(await vault.getAddress());
    expect(balance).to.gt(0n);
    expect(await vault.totalDistributed(nativeTokenAddress)).to.equal(0n, 'Invalid initial total distributed');
    expect(await vault.balanceOf(nativeTokenAddress, notOwner)).to.equal(0n, 'Invalid initial distributed');

    await expect(vault.connect(distributor).distribute(nativeTokenAddress, notOwner.address, balance))
      .to.emit(vault, 'Distribute')
      .withArgs(notOwner.address, nativeTokenAddress, balance);
    expect(await vault.totalDistributed(nativeTokenAddress)).to.equal(balance, 'Invalid total distributed');
    expect(await vault.balanceOf(nativeTokenAddress, notOwner)).to.equal(balance, 'Invalid distributed balance');
  });

  it('Should distribute token', async function () {
    const tokenAddress = await token.getAddress();
    const amount = 2n;
    await token.mint(await vault.getAddress(), amount);
    const balance = await token.balanceOf(await vault.getAddress());
    expect(balance).to.gt(0n);
    expect(await vault.totalDistributed(tokenAddress)).to.equal(0n, 'Invalid initial total distributed');
    expect(await vault.balanceOf(tokenAddress, notOwner)).to.equal(0n, 'Invalid initial distributed');

    await expect(vault.connect(distributor).distribute(tokenAddress, notOwner.address, balance))
      .to.emit(vault, 'Distribute')
      .withArgs(notOwner.address, tokenAddress, balance);
    expect(await vault.totalDistributed(tokenAddress)).to.equal(balance, 'Invalid total distributed');
    expect(await vault.balanceOf(tokenAddress, notOwner)).to.equal(balance, 'Invalid distributed balance');
  });

  it('Should revert transaction if distribution overflow for native token', async function () {
    const totalDistributed = await vault.totalDistributed(nativeTokenAddress);
    const distributedBalance = await vault.balanceOf(nativeTokenAddress, notOwner);
    expect(totalDistributed).to.equal(distributedBalance, 'Invalid initial total distributed');

    await expect(
      vault.connect(distributor).distribute(nativeTokenAddress, notOwner.address, distributedBalance),
    ).to.be.revertedWithCustomError(vault, 'VaultDistributeOverflow');
  });

  it('Should revert transaction if distribution overflow for token', async function () {
    const tokenAddress = await token.getAddress();
    const totalDistributed = await vault.totalDistributed(tokenAddress);
    const distributedBalance = await vault.balanceOf(tokenAddress, notOwner);
    expect(totalDistributed).to.equal(distributedBalance, 'Invalid initial total distributed');

    await expect(
      vault.connect(distributor).distribute(tokenAddress, notOwner.address, distributedBalance),
    ).to.be.revertedWithCustomError(vault, 'VaultDistributeOverflow');
  });

  it('Should revert withdraw if contract paused', async function () {
    await expect(vault.pause()).to.emit(vault, 'Paused');

    await expect(vault.connect(notOwner).withdraw(nativeTokenAddress)).to.be.revertedWithCustomError(
      vault,
      'EnforcedPause',
    );

    await expect(vault.unpause()).to.emit(vault, 'Unpaused');
  });

  it('Should withdraw distributed commission for native token', async function () {
    const accountBalance = await ethers.provider.getBalance(notOwner.address);
    const distributedBalance = await vault.balanceOf(nativeTokenAddress, notOwner.address);

    await expect(
      vault.connect(notOwner).withdraw(nativeTokenAddress, {
        gasPrice: 0,
      }),
    )
      .to.emit(vault, 'Withdrawal')
      .withArgs(notOwner.address, notOwner.address, nativeTokenAddress, distributedBalance);

    expect(await vault.balanceOf(nativeTokenAddress, notOwner.address)).to.equal(0n, 'Invalid distributed balance');
    expect(await vault.totalDistributed(nativeTokenAddress)).to.equal(0n, 'Invalid total distributed');
    expect(await ethers.provider.getBalance(notOwner.address)).to.equal(
      accountBalance + distributedBalance,
      'Invalid recipient balance',
    );
  });

  it('Should withdraw distributed commission for token', async function () {
    const tokenAddress = await token.getAddress();
    const accountBalance = await token.balanceOf(notOwner.address);
    const distributedBalance = await vault.balanceOf(tokenAddress, notOwner.address);

    await expect(
      vault.connect(notOwner).withdraw(tokenAddress, {
        gasPrice: 0,
      }),
    )
      .to.emit(vault, 'Withdrawal')
      .withArgs(notOwner.address, notOwner.address, tokenAddress, distributedBalance);

    expect(await vault.balanceOf(tokenAddress, notOwner.address)).to.equal(0n, 'Invalid distributed balance');
    expect(await vault.totalDistributed(tokenAddress)).to.equal(0n, 'Invalid total distributed');
    expect(await token.balanceOf(notOwner.address)).to.equal(
      accountBalance + distributedBalance,
      'Invalid recipient balance',
    );
  });

  it('Should revert withdraw from if contract not paused', async function () {
    await expect(vault.withdrawFrom(nativeTokenAddress, notOwner.address, owner.address)).to.be.revertedWithCustomError(
      vault,
      'ExpectedPause',
    );
  });

  it('Should withdraw from', async function () {
    const distributedAmount = ethers.parseEther('1.0');

    await vault.pause();
    await expect(
      vault
        .connect(distributor)
        .distribute(nativeTokenAddress, notOwner.address, distributedAmount, { value: distributedAmount }),
    )
      .to.emit(vault, 'Distribute')
      .withArgs(notOwner.address, nativeTokenAddress, distributedAmount);
    expect(await vault.balanceOf(nativeTokenAddress, notOwner.address)).to.equal(
      distributedAmount,
      'Invalid distributed balance',
    );
    expect(await vault.balanceOf(nativeTokenAddress, owner.address)).to.equal(0n, 'Invalid owner balance');

    const ownerBalanceBeforeWithdraw = await ethers.provider.getBalance(owner.address);
    await expect(vault.withdrawFrom(nativeTokenAddress, notOwner.address, owner.address, { gasPrice: 0 }))
      .to.emit(vault, 'Withdrawal')
      .withArgs(notOwner.address, owner.address, nativeTokenAddress, distributedAmount);
    expect(await ethers.provider.getBalance(owner.address)).to.equal(
      ownerBalanceBeforeWithdraw + distributedAmount,
      'Invalid withdraw balance',
    );
    await vault.unpause();
  });

  it('Should withdraw from', async function () {
    const distributedAmount = ethers.parseEther('1.0');
    const tokenAddress = await token.getAddress();

    await vault.pause();
    await token.mint(await vault.getAddress(), distributedAmount);
    await expect(vault.connect(distributor).distribute(tokenAddress, notOwner.address, distributedAmount))
      .to.emit(vault, 'Distribute')
      .withArgs(notOwner.address, tokenAddress, distributedAmount);
    expect(await vault.balanceOf(tokenAddress, notOwner.address)).to.equal(
      distributedAmount,
      'Invalid distributed balance',
    );
    expect(await vault.balanceOf(tokenAddress, owner.address)).to.equal(0n, 'Invalid owner balance');

    const ownerBalanceBeforeWithdraw = await token.balanceOf(owner.address);
    await expect(vault.withdrawFrom(tokenAddress, notOwner.address, owner.address, { gasPrice: 0 }))
      .to.emit(vault, 'Withdrawal')
      .withArgs(notOwner.address, owner.address, tokenAddress, distributedAmount);
    expect(await token.balanceOf(owner.address)).to.equal(
      ownerBalanceBeforeWithdraw + distributedAmount,
      'Invalid withdraw balance',
    );
    await vault.unpause();
  });

  it('Should withdraw crumbs for native token', async function () {
    const vaultBalance = '1.0';
    const distributedAmount = '0.42';

    await owner.sendTransaction({
      to: vault.target,
      value: ethers.parseEther(vaultBalance),
    });
    await expect(
      vault.connect(distributor).distribute(nativeTokenAddress, notOwner.address, ethers.parseEther(distributedAmount)),
    )
      .to.emit(vault, 'Distribute')
      .withArgs(notOwner.address, nativeTokenAddress, ethers.parseEther(distributedAmount));

    const ownerBalanceBeforeWithdraw = await ethers.provider.getBalance(owner.address);
    await expect(vault.withdrawCrumbs(nativeTokenAddress, owner.address, { gasPrice: 0 }))
      .to.emit(vault, 'Withdrawal')
      .withArgs(
        vault.target,
        owner.address,
        nativeTokenAddress,
        ethers.parseEther(vaultBalance) - ethers.parseEther(distributedAmount),
      );
    expect(await ethers.provider.getBalance(owner.address)).to.equal(
      ownerBalanceBeforeWithdraw + ethers.parseEther(vaultBalance) - ethers.parseEther(distributedAmount),
      'Invalid withdraw balance',
    );
  });

  it('Should withdraw crumbs for token', async function () {
    const vaultBalance = '1.0';
    const distributedAmount = '0.42';
    const tokenAddress = await token.getAddress();

    await token.mint(await vault.getAddress(), ethers.parseEther(vaultBalance));
    await expect(
      vault.connect(distributor).distribute(tokenAddress, notOwner.address, ethers.parseEther(distributedAmount)),
    )
      .to.emit(vault, 'Distribute')
      .withArgs(notOwner.address, tokenAddress, ethers.parseEther(distributedAmount));

    const ownerBalanceBeforeWithdraw = await token.balanceOf(owner.address);
    await expect(vault.withdrawCrumbs(tokenAddress, owner.address, { gasPrice: 0 }))
      .to.emit(vault, 'Withdrawal')
      .withArgs(
        vault.target,
        owner.address,
        tokenAddress,
        ethers.parseEther(vaultBalance) - ethers.parseEther(distributedAmount),
      );
    expect(await token.balanceOf(owner.address)).to.equal(
      ownerBalanceBeforeWithdraw + ethers.parseEther(vaultBalance) - ethers.parseEther(distributedAmount),
      'Invalid withdraw balance',
    );
  });

  it('Should reset', async function () {
    const distributedAmount = ethers.parseEther('1.0');

    await vault.pause();
    await vault.reset(nativeTokenAddress, notOwner.address, { gasPrice: 0 });
    await expect(
      vault
        .connect(distributor)
        .distribute(nativeTokenAddress, notOwner.address, distributedAmount, { value: distributedAmount }),
    )
      .to.emit(vault, 'Distribute')
      .withArgs(notOwner.address, nativeTokenAddress, distributedAmount);
    expect(await vault.balanceOf(nativeTokenAddress, notOwner.address)).to.equal(
      distributedAmount,
      'Invalid distributed balance',
    );

    await expect(vault.reset(nativeTokenAddress, notOwner.address, { gasPrice: 0 }))
      .to.emit(vault, 'Reset')
      .withArgs(notOwner.address, nativeTokenAddress);
    expect(await vault.balanceOf(nativeTokenAddress, notOwner.address)).to.equal(0n, 'Invalid skipped balance');
  });
});
