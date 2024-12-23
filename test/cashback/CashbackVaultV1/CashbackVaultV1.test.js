const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const mockSeeds = require('../../seeds/mock');
const BN = require('big.js');

describe('CashbackVaultV1', function () {
  let owner, signer, notOwner;
  let cashbackVault;
  before(async function () {
    [owner, signer, notOwner] = await ethers.getSigners();

    [erc20] = await mockSeeds.erc20();
    await erc20.transferOwnership(await owner.getAddress());

    const CashbackVaultV1 = await ethers.getContractFactory('contracts/cashback/CashbackVaultV1.sol:CashbackVaultV1');
    cashbackVault = await upgrades.deployProxy(CashbackVaultV1, [await erc20.getAddress(), signer.address], {
      initializer: 'initialize',
      unsafeAllow: ['constructor'],
    });
  });

  it('Should receive tokens', async function () {
    const amount = BN(100).mul(1e6).toFixed(0);
    await erc20.mint(await cashbackVault.getAddress(), amount);

    const payload = {
      requestId: 0,
      recipient: await notOwner.getAddress(),
      amount,
      signature: '',
    };
    payload.signature = await signer.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(
          ['uint80', 'address', 'uint256'],
          [payload.requestId, payload.recipient, payload.amount],
        ),
      ),
    );
    expect(false).to.eq(await cashbackVault.request(payload.requestId));

    await expect(cashbackVault.withdraw(payload.recipient, payload.requestId, payload.amount, payload.signature))
      .to.emit(cashbackVault, 'CashbackWithdraw')
      .withArgs(payload.recipient, payload.requestId, payload.amount);
    expect(0).to.eq(await erc20.balanceOf(await cashbackVault.getAddress()));
    expect(amount).to.eq(await erc20.balanceOf(await notOwner.getAddress()));
  });

  it('Should revert if signature invalid', async function () {
    const amount = BN(100).mul(1e6).toFixed(0);

    const payload = {
      requestId: 0,
      recipient: await notOwner.getAddress(),
      amount,
      signature: '',
    };
    payload.signature = await owner.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(
          ['uint80', 'address', 'uint256'],
          [payload.requestId, payload.recipient, payload.amount],
        ),
      ),
    );
    expect(true).to.eq(await cashbackVault.request(payload.requestId));

    await expect(
      cashbackVault.withdraw(payload.recipient, payload.requestId, payload.amount, payload.signature),
    ).to.be.revertedWithCustomError(cashbackVault, 'CashbackVaultV1InvalidWithdrawSignature');
  });

  it('Should revert if withdraw already completed', async function () {
    const amount = BN(100).mul(1e6).toFixed(0);

    const payload = {
      requestId: 0,
      recipient: await notOwner.getAddress(),
      amount,
      signature: '',
    };
    payload.signature = await signer.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(
          ['uint80', 'address', 'uint256'],
          [payload.requestId, payload.recipient, payload.amount],
        ),
      ),
    );

    await expect(
      cashbackVault.withdraw(payload.recipient, payload.requestId, payload.amount, payload.signature),
    ).to.be.revertedWithCustomError(cashbackVault, 'CashbackVaultV1WithdrawAlreadyCompleted');
  });

  it('Should revert if contract paused', async function () {
    const amount = BN(100).mul(1e6).toFixed(0);

    const payload = {
      requestId: 1,
      recipient: await notOwner.getAddress(),
      amount,
      signature: '',
    };
    payload.signature = await signer.signMessage(
      ethers.getBytes(
        ethers.solidityPackedKeccak256(
          ['uint80', 'address', 'uint256'],
          [payload.requestId, payload.recipient, payload.amount],
        ),
      ),
    );

    await cashbackVault.pause();
    await expect(
      cashbackVault.withdraw(payload.recipient, payload.requestId, payload.amount, payload.signature),
    ).to.be.revertedWithCustomError(cashbackVault, 'EnforcedPause');
    await cashbackVault.unpause();
  });

  it('Should transfer tokens to owner', async function () {
    const amount = BN(100).mul(1e6).toFixed(0);
    await erc20.mint(await cashbackVault.getAddress(), amount);

    await expect(cashbackVault.withdrawCrumbs(await owner.getAddress(), amount))
      .to.emit(cashbackVault, 'CashbackWithdrawCrumbs')
      .withArgs(await owner.getAddress(), amount);
    expect(0).to.eq(await erc20.balanceOf(await cashbackVault.getAddress()));
    expect(amount).to.eq(await erc20.balanceOf(await owner.getAddress()));
  });

  it('Should revert if call not owner', async function () {
    const amount = BN(100).mul(1e6).toFixed(0);
    await erc20.mint(await cashbackVault.getAddress(), amount);

    await expect(
      cashbackVault.connect(notOwner).withdrawCrumbs(await owner.getAddress(), amount),
    ).to.be.revertedWithCustomError(cashbackVault, 'OwnableUnauthorizedAccount');
  });
});
