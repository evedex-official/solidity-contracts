const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const mockSeeds = require('../../seeds/mock');

describe('Treasury', function () {
  let owner, distributor, notOwner;
  let treasury, erc20, vault;
  before(async function () {
    [owner, distributor, notOwner] = await ethers.getSigners();

    [erc20] = await mockSeeds.erc20();
    await erc20.transferOwnership(await owner.getAddress());

    const TreasuryV1 = await ethers.getContractFactory('contracts/treasury/TreasuryV1.sol:TreasuryV1');
    treasury = await upgrades.deployProxy(TreasuryV1, [], {
      initializer: 'initialize',
      unsafeAllow: ['constructor'],
    });

    const VaultV1 = await ethers.getContractFactory('contracts/vault/VaultV1.sol:VaultV1');
    vault = await upgrades.deployProxy(VaultV1, [], {
      initializer: 'initialize',
      unsafeAllow: ['constructor'],
    });
    await vault.addDistributor(await distributor.getAddress());
  });

  it('Should transfer ERC20', async function () {
    const amount = 10n;

    await erc20.connect(owner).mint(await treasury.getAddress(), amount);
    expect(await erc20.balanceOf(await treasury.getAddress())).to.equal(amount);
    expect(await erc20.balanceOf(await owner.getAddress())).to.equal(0n);

    await treasury.connect(owner).transfer(await erc20.getAddress(), await owner.getAddress(), amount);

    expect(await erc20.balanceOf(await treasury.getAddress())).to.equal(0n);
    expect(await erc20.balanceOf(await owner.getAddress())).to.equal(amount);
  });

  it('Should revert transfer ERC20 transaction if call not owner', async function () {
    await expect(
      treasury.connect(notOwner).transfer(await erc20.getAddress(), await owner.getAddress(), 0n),
    ).to.be.revertedWithCustomError(treasury, 'OwnableUnauthorizedAccount');
  });

  it('Should transfer ETH', async function () {
    const amount = 10n;

    await owner.sendTransaction({
      to: await treasury.getAddress(),
      value: ethers.parseEther(String(amount)),
    });
    expect(
      await ethers.provider.getBalance(await treasury.getAddress()).then((v) => ethers.formatEther(v.toString())),
    ).to.eq(`${amount}.0`);

    await treasury.connect(owner).transferETH(await owner.getAddress(), ethers.parseEther(String(amount)), {
      gasPrice: 0,
    });

    expect(
      await ethers.provider.getBalance(await treasury.getAddress()).then((v) => ethers.formatEther(v.toString())),
    ).to.eq('0.0');
  });

  it('Should revert transfer ETH transaction if call not owner', async function () {
    await expect(treasury.connect(notOwner).transferETH(await owner.getAddress(), 0n)).to.be.revertedWithCustomError(
      treasury,
      'OwnableUnauthorizedAccount',
    );
  });

  it('Should approve ERC20', async function () {
    const amount = 10n;

    expect(
      await erc20.allowance(await treasury.getAddress(), await owner.getAddress()).then((v) => v.toString()),
    ).to.equal('0');

    await treasury.connect(owner).approve(await erc20.getAddress(), await owner.getAddress(), amount);

    expect(
      await erc20.allowance(await treasury.getAddress(), await owner.getAddress()).then((v) => v.toString()),
    ).to.equal(amount);
  });

  it('Should revert approve transaction if call not owner', async function () {
    await expect(
      treasury.connect(notOwner).approve(await erc20.getAddress(), await owner.getAddress(), 0n),
    ).to.be.revertedWithCustomError(treasury, 'OwnableUnauthorizedAccount');
  });

  it('Should withdraw from Vault', async function () {
    const amount = 10n;

    await vault.connect(distributor).distribute(await treasury.getAddress(), ethers.parseEther(String(amount)), {
      value: ethers.parseEther(String(amount)),
    });
    expect(
      await ethers.provider.getBalance(await treasury.getAddress()).then((v) => ethers.formatEther(v.toString())),
    ).to.eq('0.0');

    await treasury.connect(owner).withdrawFrom(await vault.getAddress());

    expect(
      await ethers.provider.getBalance(await treasury.getAddress()).then((v) => ethers.formatEther(v.toString())),
    ).to.eq(`${amount}.0`);
  });

  it('Should revert withdraw transaction if call not owner', async function () {
    await expect(treasury.connect(notOwner).withdrawFrom(await vault.getAddress())).to.be.revertedWithCustomError(
      treasury,
      'OwnableUnauthorizedAccount',
    );
  });
});
