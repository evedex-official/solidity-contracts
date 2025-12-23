const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');

describe('LuckyShot', function () {
  let owner, signer, winner, other;
  let luckyShot, erc20, storage;
  let chainId;

  const signClaim = async (signerWallet, nonce, recipient, token, amount, contractAddress = undefined) => {
    const messageHash = ethers.solidityPackedKeccak256(
      ['string', 'uint256', 'address', 'address', 'uint256', 'address'],
      [nonce, chainId, recipient, token, amount, contractAddress ?? (await luckyShot.getAddress())],
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

    const LuckyShot = await ethers.getContractFactory('LuckyShot');
    luckyShot = await upgrades.deployProxy(LuckyShot, [await storage.getAddress(), await owner.getAddress()]);

    await storage.setAddress(ethers.id('EH:LuckyShot:Signer'), await signer.getAddress());
  });

  describe('Claim', function () {
    it('Should claim ERC20 tokens with valid signature', async function () {
      const amount = ethers.parseEther('100');
      const nonce = 'test-nonce-1';
      await erc20.mint(await luckyShot.getAddress(), amount);
      const signature = await signClaim(signer, nonce, await winner.getAddress(), await erc20.getAddress(), amount);
      await expect(
        luckyShot.connect(winner).claim({
          recipient: await winner.getAddress(),
          token: await erc20.getAddress(),
          amount,
          nonce,
          signature,
        }),
      )
        .to.emit(luckyShot, 'Claimed')
        .withArgs(await winner.getAddress(), await erc20.getAddress(), amount, nonce);
      expect(await erc20.balanceOf(await winner.getAddress())).to.equal(amount);
      expect(await luckyShot.usedNonces(nonce)).to.be.true;
    });

    it('Should revert if nonce already used', async function () {
      const amount = ethers.parseEther('100');
      const nonce = 'test-nonce-1';
      await erc20.mint(await luckyShot.getAddress(), amount * 2n);
      const signature = await signClaim(signer, nonce, await winner.getAddress(), await erc20.getAddress(), amount);
      await luckyShot.connect(winner).claim({
        recipient: await winner.getAddress(),
        token: await erc20.getAddress(),
        amount,
        nonce,
        signature,
      });
      await expect(
        luckyShot.connect(winner).claim({
          recipient: await winner.getAddress(),
          token: await erc20.getAddress(),
          amount,
          nonce,
          signature,
        }),
      ).to.be.revertedWithCustomError(luckyShot, 'NonceAlreadyUsed');
    });

    it('Should revert if signature is from wrong signer', async function () {
      const amount = ethers.parseEther('100');
      const nonce = 'test-nonce-2';
      await erc20.mint(await luckyShot.getAddress(), amount);
      const signature = await signClaim(other, nonce, await winner.getAddress(), await erc20.getAddress(), amount);
      await expect(
        luckyShot.connect(winner).claim({
          recipient: await winner.getAddress(),
          token: await erc20.getAddress(),
          amount,
          nonce,
          signature,
        }),
      ).to.be.revertedWithCustomError(luckyShot, 'InvalidSignature');
    });

    it('Should revert if recipient in signature does not match caller', async function () {
      const amount = ethers.parseEther('100');
      const nonce = 'test-nonce-3';
      await erc20.mint(await luckyShot.getAddress(), amount);
      const signature = await signClaim(signer, nonce, await winner.getAddress(), await erc20.getAddress(), amount);
      await expect(
        luckyShot.connect(other).claim({
          recipient: await other.getAddress(),
          token: await erc20.getAddress(),
          amount,
          nonce,
          signature,
        }),
      ).to.be.revertedWithCustomError(luckyShot, 'InvalidSignature');
    });

    it('Should revert if amount is tampered', async function () {
      const amount = ethers.parseEther('100');
      const nonce = 'test-nonce-4';
      await erc20.mint(await luckyShot.getAddress(), amount * 2n);
      const signature = await signClaim(signer, nonce, await winner.getAddress(), await erc20.getAddress(), amount);
      await expect(
        luckyShot.connect(winner).claim({
          recipient: await winner.getAddress(),
          token: await erc20.getAddress(),
          amount: amount * 2n,
          nonce,
          signature,
        }),
      ).to.be.revertedWithCustomError(luckyShot, 'InvalidSignature');
    });

    it('Should revert if token is tampered', async function () {
      const amount = ethers.parseEther('100');
      const nonce = 'test-nonce-5';
      await erc20.mint(await luckyShot.getAddress(), amount);
      const signature = await signClaim(signer, nonce, await winner.getAddress(), await erc20.getAddress(), amount);
      await expect(
        luckyShot.connect(winner).claim({
          recipient: await winner.getAddress(),
          token: ethers.ZeroAddress,
          amount,
          nonce,
          signature,
        }),
      ).to.be.revertedWithCustomError(luckyShot, 'InvalidSignature');
    });

    it('Should revert if signer not configured', async function () {
      await storage.setAddress(ethers.id('EH:LuckyShot:Signer'), ethers.ZeroAddress);
      const nonce = 'test-nonce-6';
      await expect(
        luckyShot.connect(winner).claim({
          recipient: await winner.getAddress(),
          token: await erc20.getAddress(),
          amount: 100,
          nonce,
          signature: '0x' + '00'.repeat(65),
        }),
      ).to.be.revertedWithCustomError(luckyShot, 'SignerNotFound');
    });
  });

  describe('Pause', function () {
    it('Should pause and unpause', async function () {
      expect(await luckyShot.paused()).to.be.false;
      await luckyShot.pause();
      expect(await luckyShot.paused()).to.be.true;
      await luckyShot.unpause();
      expect(await luckyShot.paused()).to.be.false;
    });

    it('Should revert claim when paused', async function () {
      await luckyShot.pause();
      const nonce = 'test-nonce-7';
      await expect(
        luckyShot.connect(winner).claim({
          recipient: await winner.getAddress(),
          token: await erc20.getAddress(),
          amount: 100,
          nonce,
          signature: '0x' + '00'.repeat(65),
        }),
      ).to.be.revertedWithCustomError(luckyShot, 'EnforcedPause');
    });

    it('Should only allow owner to pause', async function () {
      await expect(luckyShot.connect(other).pause()).to.be.revertedWithCustomError(
        luckyShot,
        'OwnableUnauthorizedAccount',
      );
    });

    it('Should only allow owner to unpause', async function () {
      await luckyShot.pause();
      await expect(luckyShot.connect(other).unpause()).to.be.revertedWithCustomError(
        luckyShot,
        'OwnableUnauthorizedAccount',
      );
    });
  });

  describe('Withdraw', function () {
    it('Should withdraw ERC20 tokens', async function () {
      const amount = ethers.parseEther('100');
      await erc20.mint(await luckyShot.getAddress(), amount);
      await expect(luckyShot.withdraw(await erc20.getAddress(), await owner.getAddress(), amount))
        .to.emit(luckyShot, 'Withdrawn')
        .withArgs(await erc20.getAddress(), await owner.getAddress(), amount);
      expect(await erc20.balanceOf(await owner.getAddress())).to.equal(amount);
    });

    it('Should withdraw native ETH', async function () {
      const amount = ethers.parseEther('1');
      await owner.sendTransaction({ to: await luckyShot.getAddress(), value: amount });
      const balanceBefore = await ethers.provider.getBalance(await other.getAddress());
      await expect(luckyShot.withdraw(ethers.ZeroAddress, await other.getAddress(), amount))
        .to.emit(luckyShot, 'Withdrawn')
        .withArgs(ethers.ZeroAddress, await other.getAddress(), amount);
      const balanceAfter = await ethers.provider.getBalance(await other.getAddress());
      expect(balanceAfter).to.equal(balanceBefore + amount);
    });

    it('Should only allow owner to withdraw', async function () {
      await expect(
        luckyShot.connect(other).withdraw(await erc20.getAddress(), await other.getAddress(), 100),
      ).to.be.revertedWithCustomError(luckyShot, 'OwnableUnauthorizedAccount');
    });
  });
});
