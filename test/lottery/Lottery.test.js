'use strict';

const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

describe('Lottery Contract', function () {
  let owner, signer, winner, other;
  let lottery, erc20, storage;
  let chainId;

  const signClaim = async (signerWallet, recipient, token, amount, nonce, contractAddress) => {
    const messageHash = ethers.solidityPackedKeccak256(
      ['address', 'address', 'uint256', 'string', 'uint256', 'address'],
      [recipient, token, amount, nonce, chainId, contractAddress],
    );
    return signerWallet.signMessage(ethers.getBytes(messageHash));
  };

  beforeEach(async function () {
    [owner, signer, winner, other] = await ethers.getSigners();
    chainId = (await ethers.provider.getNetwork()).chainId;

    const Storage = await ethers.getContractFactory('Storage');
    storage = await Storage.deploy();

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    erc20 = await ERC20Mock.deploy();

    const Lottery = await ethers.getContractFactory('Lottery');
    lottery = await upgrades.deployProxy(Lottery, [await storage.getAddress(), await owner.getAddress()]);

    await storage.setAddress(ethers.id('EH:Lottery:Signer'), await signer.getAddress());
  });

  describe('Claim Prize', function () {
    it('Should claim ERC20 tokens with valid signature', async function () {
      const amount = ethers.parseEther('100');
      const nonce = 'uuid-v4-test-1';

      await erc20.mint(await lottery.getAddress(), amount);

      const signature = await signClaim(
        signer,
        await winner.getAddress(),
        await erc20.getAddress(),
        amount,
        nonce,
        await lottery.getAddress(),
      );

      await expect(lottery.connect(winner).claim(await erc20.getAddress(), amount, nonce, signature))
        .to.emit(lottery, 'Claimed')
        .withArgs(await winner.getAddress(), await erc20.getAddress(), amount, nonce);

      expect(await erc20.balanceOf(await winner.getAddress())).to.equal(amount);
      expect(await lottery.usedNonces(nonce)).to.be.true;
    });

    it('Should revert if nonce already used', async function () {
      const amount = ethers.parseEther('100');
      const nonce = 'uuid-v4-test-2';
      await erc20.mint(await lottery.getAddress(), amount * 2n);
      const signature = await signClaim(
        signer,
        await winner.getAddress(),
        await erc20.getAddress(),
        amount,
        nonce,
        await lottery.getAddress(),
      );
      await lottery.connect(winner).claim(await erc20.getAddress(), amount, nonce, signature);
      await expect(
        lottery.connect(winner).claim(await erc20.getAddress(), amount, nonce, signature),
      ).to.be.revertedWithCustomError(lottery, 'NonceAlreadyUsed');
    });

    it('Should revert if signature is invalid', async function () {
      const amount = ethers.parseEther('100');
      const nonce = 'uuid-v4-test-3';
      await erc20.mint(await lottery.getAddress(), amount);

      const signature = await signClaim(
        other,
        await winner.getAddress(),
        await erc20.getAddress(),
        amount,
        nonce,
        await lottery.getAddress(),
      );

      await expect(
        lottery.connect(winner).claim(await erc20.getAddress(), amount, nonce, signature),
      ).to.be.revertedWithCustomError(lottery, 'InvalidSignature');
    });

    it('Should revert if wrong recipient tries to claim', async function () {
      const amount = ethers.parseEther('100');
      const nonce = 'uuid-v4-test-4';

      await erc20.mint(await lottery.getAddress(), amount);

      const signature = await signClaim(
        signer,
        await winner.getAddress(),
        await erc20.getAddress(),
        amount,
        nonce,
        await lottery.getAddress(),
      );

      await expect(
        lottery.connect(other).claim(await erc20.getAddress(), amount, nonce, signature),
      ).to.be.revertedWithCustomError(lottery, 'InvalidSignature');
    });

    it('Should revert if signer not configured', async function () {
      await storage.setAddress(ethers.id('EH:Lottery:Signer'), ethers.ZeroAddress);
      await expect(
        lottery.connect(winner).claim(await erc20.getAddress(), 100, 'nonce', '0x'),
      ).to.be.revertedWithCustomError(lottery, 'SignerNotFound');
    });
  });

  describe('Pause', function () {
    it('Should pause and unpause', async function () {
      await lottery.pause();
      expect(await lottery.paused()).to.be.true;
      await lottery.unpause();
      expect(await lottery.paused()).to.be.false;
    });

    it('Should revert claim when paused', async function () {
      await lottery.pause();
      await expect(
        lottery.connect(winner).claim(await erc20.getAddress(), 100, 'nonce', '0x'),
      ).to.be.revertedWithCustomError(lottery, 'EnforcedPause');
    });

    it('Should only allow owner to pause/unpause', async function () {
      await expect(lottery.connect(other).pause()).to.be.revertedWithCustomError(lottery, 'OwnableUnauthorizedAccount');
    });
  });

  describe('Withdraw', function () {
    it('Should withdraw ERC20 tokens', async function () {
      const amount = ethers.parseEther('100');
      await erc20.mint(await lottery.getAddress(), amount);

      await expect(lottery.withdraw(await erc20.getAddress(), await owner.getAddress(), amount))
        .to.emit(lottery, 'Withdrawn')
        .withArgs(await erc20.getAddress(), await owner.getAddress(), amount);

      expect(await erc20.balanceOf(await owner.getAddress())).to.equal(amount);
    });

    it('Should withdraw native ETH', async function () {
      const amount = ethers.parseEther('1');
      await owner.sendTransaction({ to: await lottery.getAddress(), value: amount });
      await expect(lottery.withdraw(ethers.ZeroAddress, await other.getAddress(), amount))
        .to.emit(lottery, 'Withdrawn')
        .withArgs(ethers.ZeroAddress, await other.getAddress(), amount);
    });

    it('Should only allow owner to withdraw', async function () {
      await expect(
        lottery.connect(other).withdraw(await erc20.getAddress(), await other.getAddress(), 100),
      ).to.be.revertedWithCustomError(lottery, 'OwnableUnauthorizedAccount');
    });
  });
});
