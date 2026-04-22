const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');

describe('EHMarketV3', function () {
  let container = {};
  before(async function () {
    const [owner, matcher1, matcher2, alice, bob, carol] = await ethers.getSigners();
    const MockToken = await ethers.getContractFactory('MockToken');
    const usdt = await MockToken.deploy('USDT', 'USDT', owner.address);
    await usdt.mint(owner.address, ethers.parseEther('1000000'));
    await usdt.mint(alice.address, ethers.parseEther('1000000'));
    await usdt.mint(bob.address, ethers.parseEther('1000000'));
    await usdt.mint(carol.address, ethers.parseEther('1000000'));
    const EHMarket = await ethers.getContractFactory('contracts/ehmarket/EHMarketV3.sol:EHMarketV3');
    const market = await upgrades.deployProxy(
      EHMarket,
      [[matcher1.address, matcher2.address], await usdt.getAddress(), []],
      {
        initializer: 'initialize',
        unsafeAllow: ['constructor'],
      },
    );
    container = { owner, matcher1, matcher2, market, usdt, alice, bob, carol };
  });

  describe('Deployment', function () {
    it('should deploy correctly', async function () {
      const { market } = container;
      expect(await market.getAddress()).to.properAddress;
    });

    it('Should set initial params', async function () {
      const { market, usdt, matcher1, matcher2 } = container;
      console.log(await market.getAddress());

      const collateral = await market.collateral();
      expect(collateral).to.equal(await usdt.getAddress(), 'wrong collateral address');

      const matcherRole = await market.MATCHER_ROLE();
      const hasMatcher1Role = await market.hasRole(matcherRole, matcher1.address);

      expect(hasMatcher1Role).to.be.true;
      const hasMatcher2Role = await market.hasRole(matcherRole, matcher2.address);
      expect(hasMatcher2Role).to.be.true;
    });
  });

  describe('basic user interaction', async function () {
    it('should deposit tokens', async function () {
      const { alice, market, usdt } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await expect(market.connect(alice).depositAsset(amount))
        .to.emit(market, 'UserBalanceChanged')
        .withArgs(await alice.getAddress(), amount, 0);
    });

    it('should deposit tokens to another account', async function () {
      const { alice, bob, market, usdt } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await expect(market.connect(alice).depositAssetTo(await bob.getAddress(), amount))
        .to.emit(market, 'UserBalanceChanged')
        .withArgs(await bob.getAddress(), amount, 0);
    });

    it('should withdraw tokens with signature', async function () {
      const deadline = await ethers.provider.getBlock('latest').then((block) => (block?.timestamp ?? 0) + 60 * 60); // 1 hour later

      const { alice, market, usdt, matcher1 } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await market.connect(alice).depositAsset(amount);

      await expect(market.connect(matcher1).withdrawAsset(await alice.getAddress(), amount, 1))
        .to.emit(market, 'UserBalanceChanged')
        .withArgs(await alice.getAddress(), `-${amount.toString()}`, 1);
    });

    it('should allow admin to add matcher', async function () {
      const { owner, market, alice } = container;
      const matcherRole = await market.MATCHER_ROLE();
      expect(await market.hasRole(matcherRole, alice.address)).to.be.false;
      await expect(market.connect(owner).grantRole(matcherRole, alice.address))
        .to.emit(market, 'RoleGranted')
        .withArgs(matcherRole, alice.address, owner.address);
      expect(await market.hasRole(matcherRole, alice.address)).to.be.true;
    });

    it('should allow admin to add another admin', async function () {
      const { owner, market, bob } = container;
      const adminRole = await market.DEFAULT_ADMIN_ROLE();
      expect(await market.hasRole(adminRole, bob.address)).to.be.false;
      await expect(market.connect(owner).grantRole(adminRole, bob.address))
        .to.emit(market, 'RoleGranted')
        .withArgs(adminRole, bob.address, owner.address);
      expect(await market.hasRole(adminRole, bob.address)).to.be.true;
    });

    it('should allow admin to remove matcher', async function () {
      const { owner, market, alice } = container;
      const matcherRole = await market.MATCHER_ROLE();
      expect(await market.hasRole(matcherRole, alice.address)).to.be.true;
      await expect(market.connect(owner).revokeRole(matcherRole, alice.address))
        .to.emit(market, 'RoleRevoked')
        .withArgs(matcherRole, alice.address, owner.address);
      expect(await market.hasRole(matcherRole, alice.address)).to.be.false;
    });

    it('should allow admin to remove another admin', async function () {
      const { owner, market, bob } = container;
      const adminRole = await market.DEFAULT_ADMIN_ROLE();
      expect(await market.hasRole(adminRole, bob.address)).to.be.true;
      await expect(market.connect(owner).revokeRole(adminRole, bob.address))
        .to.emit(market, 'RoleRevoked')
        .withArgs(adminRole, bob.address, owner.address);
      expect(await market.hasRole(adminRole, bob.address)).to.be.false;
    });

    it('setDelegate should throw event', async function () {
      const { owner, market, matcher1 } = container;
      const delegate = await matcher1.getAddress();
      await expect(market.connect(owner).setDelegate(delegate, 1))
        .to.emit(market, 'DelegateUpdated')
        .withArgs(await owner.getAddress(), delegate, 1);
    });
  });

  describe('withdraw limits', async function () {
    beforeEach(async function () {
      const { owner, market } = container;
      await market.connect(owner).setWithdrawLimits([]);
      await ethers.provider.send('evm_increaseTime', [3600 * 24 * 365]);
      await ethers.provider.send('evm_mine');
    });

    it('should set withdraw limits', async function () {
      const { owner, market } = container;
      const withdrawLimits = [
        { limit: ethers.parseEther('5000'), userLimit: ethers.parseEther('500'), timeWindow: 1 },
        { limit: ethers.parseEther('10000'), userLimit: ethers.parseEther('1000'), timeWindow: 6 },
      ];
      await expect(market.connect(owner).setWithdrawLimits(withdrawLimits)).to.emit(market, 'WithdrawLimitsUpdated');
      const limit0 = await market.withdrawLimits(0);
      expect(limit0.limit).to.equal(withdrawLimits[0].limit);
      expect(limit0.userLimit).to.equal(withdrawLimits[0].userLimit);
      expect(limit0.timeWindow).to.equal(withdrawLimits[0].timeWindow);
      const limit1 = await market.withdrawLimits(1);
      expect(limit1.limit).to.equal(withdrawLimits[1].limit);
      expect(limit1.userLimit).to.equal(withdrawLimits[1].userLimit);
      expect(limit1.timeWindow).to.equal(withdrawLimits[1].timeWindow);
    });

    it('should allow admin to withdraw without limits', async function () {
      const { owner, market, alice, usdt } = container;
      await market
        .connect(owner)
        .setWithdrawLimits([{ limit: ethers.parseEther('2000'), userLimit: ethers.parseEther('500'), timeWindow: 6 }]);

      const depositAmount = ethers.parseEther('3000');
      await usdt.connect(alice).approve(await market.getAddress(), depositAmount);
      await market.connect(alice).depositAsset(depositAmount);
      const withdrawAmount = ethers.parseEther('3000');
      await market.connect(owner).withdrawAsset(await alice.getAddress(), withdrawAmount, 2);
    });

    it('should allow matcher with admin role withdraw without limits', async function () {
      const { market, matcher1, alice, usdt } = container;

      await market.grantRole(await market.DEFAULT_ADMIN_ROLE(), matcher1.getAddress());
      await market.grantRole(await market.MATCHER_ROLE(), matcher1.getAddress());

      await market.setWithdrawLimits([
        { limit: ethers.parseEther('2000'), userLimit: ethers.parseEther('500'), timeWindow: 6 },
      ]);

      const depositAmount = ethers.parseEther('3000');
      await usdt.connect(alice).approve(await market.getAddress(), depositAmount);
      await market.connect(alice).depositAsset(depositAmount);
      const withdrawAmount = ethers.parseEther('3000');
      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), withdrawAmount, 3);

      await market.revokeRole(await market.DEFAULT_ADMIN_ROLE(), matcher1.getAddress());
    });

    it('should throw if too much limits', async function () {
      const { owner, market } = container;
      const withdrawLimits = [];
      for (let i = 0; i < 100; i++) {
        withdrawLimits.push({
          limit: ethers.parseEther('1000'),
          userLimit: ethers.parseEther('100'),
          timeWindow: 1,
        });
      }
      await expect(market.connect(owner).setWithdrawLimits(withdrawLimits)).to.be.revertedWithCustomError(
        market,
        'InvalidWithdrawLimitLength',
      );
    });

    it('should enforce unique limits', async function () {
      const { owner, market } = container;
      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('1'), userLimit: ethers.parseEther('1'), timeWindow: 6 },
          { limit: ethers.parseEther('2'), userLimit: ethers.parseEther('2'), timeWindow: 6 },
        ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('1'), userLimit: ethers.parseEther('1'), timeWindow: 6 },
          { limit: ethers.parseEther('2'), userLimit: ethers.parseEther('1'), timeWindow: 7 },
        ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('3'), userLimit: ethers.parseEther('1'), timeWindow: 6 },
          { limit: ethers.parseEther('3'), userLimit: ethers.parseEther('2'), timeWindow: 7 },
        ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');

      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('2'), userLimit: ethers.parseEther('1'), timeWindow: 5 },
          { limit: ethers.parseEther('3'), userLimit: ethers.parseEther('2'), timeWindow: 6 },
        ]),
      ).to.emit(market, 'WithdrawLimitsUpdated');
    });

    it('limits should be ordered in ascending order', async function () {
      const { owner, market } = container;
      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('1'), userLimit: ethers.parseEther('1'), timeWindow: 6 },
          { limit: ethers.parseEther('2'), userLimit: ethers.parseEther('2'), timeWindow: 5 },
        ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');

      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('4'), userLimit: ethers.parseEther('1'), timeWindow: 5 },
          { limit: ethers.parseEther('3'), userLimit: ethers.parseEther('2'), timeWindow: 6 },
        ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
      await expect(
        market.connect(owner).setWithdrawLimits([
          { limit: ethers.parseEther('3'), userLimit: ethers.parseEther('2'), timeWindow: 5 },
          { limit: ethers.parseEther('3'), userLimit: ethers.parseEther('1'), timeWindow: 6 },
        ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
    });

    it('should reject invalid withdraw limits', async function () {
      const { owner, market } = container;

      await expect(
        market
          .connect(owner)
          .setWithdrawLimits([
            { limit: ethers.parseEther('100'), userLimit: ethers.parseEther('1000'), timeWindow: 6 },
          ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');

      await expect(
        market.connect(owner).setWithdrawLimits([{ limit: 0, userLimit: 0, timeWindow: 6 }]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');

      await expect(
        market
          .connect(owner)
          .setWithdrawLimits([
            { limit: ethers.parseEther('10000'), userLimit: ethers.parseEther('1000'), timeWindow: 0 },
          ]),
      ).to.be.revertedWithCustomError(market, 'InvalidWithdrawLimit');
    });

    it('should track withdrawals and enforce global limits', async function () {
      const { owner, market, matcher1, alice, bob, usdt } = container;
      await market
        .connect(owner)
        .setWithdrawLimits([{ limit: ethers.parseEther('1000'), userLimit: ethers.parseEther('500'), timeWindow: 6 }]);

      const depositAmount = ethers.parseEther('2000');
      await usdt.connect(alice).approve(await market.getAddress(), depositAmount);
      await market.connect(alice).depositAsset(depositAmount);

      const withdrawAmount = ethers.parseEther('500');
      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), withdrawAmount, 4);

      const totalWithdrawn = await market.getTotalWithdraw(
        6,
        await ethers.provider.getBlock('latest').then((b) => b.timestamp),
      );
      expect(totalWithdrawn).to.equal(withdrawAmount);

      await usdt.connect(bob).approve(await market.getAddress(), depositAmount);
      await market.connect(bob).depositAsset(depositAmount);

      await market.connect(matcher1).withdrawAsset(await bob.getAddress(), withdrawAmount, 5);

      await expect(
        market.connect(matcher1).withdrawAsset(await bob.getAddress(), withdrawAmount, 6),
      ).to.be.revertedWithCustomError(market, 'TotalLimitExceeded');
    });

    it('should enforce per-user limits', async function () {
      const { owner, market, matcher1, alice, usdt } = container;
      await market
        .connect(owner)
        .setWithdrawLimits([{ limit: ethers.parseEther('2000'), userLimit: ethers.parseEther('500'), timeWindow: 6 }]);

      const depositAmount = ethers.parseEther('2000');
      await usdt.connect(alice).approve(await market.getAddress(), depositAmount);
      await market.connect(alice).depositAsset(depositAmount);
      const withdrawAmount = ethers.parseEther('500');
      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), withdrawAmount, 7);

      const userWithdrawn = await market.getUserTotalWithdraw(
        6,
        await ethers.provider.getBlock('latest').then((b) => b.timestamp),
        await alice.getAddress(),
      );
      expect(userWithdrawn).to.equal(withdrawAmount);
      const smallAmount = ethers.parseEther('1');
      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), smallAmount, 8),
      ).to.be.revertedWithCustomError(market, 'UserLimitExceeded');
    });

    it('should correctly calculate max withdraw amount', async function () {
      const { owner, market, matcher1, alice, usdt, bob, carol } = container;

      let maxInfo = await market.getMaxWithdrawAmount(await alice.getAddress());
      expect(maxInfo[0]).to.equal(ethers.MaxUint256);
      expect(maxInfo[1]).to.equal(ethers.MaxUint256);
      expect(maxInfo[2]).to.equal(false);

      await market.connect(owner).setWithdrawLimits([
        { limit: ethers.parseEther('200'), userLimit: ethers.parseEther('100'), timeWindow: 1 },
        { limit: ethers.parseEther('300'), userLimit: ethers.parseEther('200'), timeWindow: 6 },
      ]);

      const depositAmount = ethers.parseEther('2000');
      await usdt.connect(alice).approve(await market.getAddress(), depositAmount);
      await market.connect(alice).depositAsset(depositAmount);
      await usdt.connect(bob).approve(await market.getAddress(), depositAmount);
      await market.connect(bob).depositAsset(depositAmount);
      await usdt.connect(carol).approve(await market.getAddress(), depositAmount);
      await market.connect(carol).depositAsset(depositAmount);

      maxInfo = await market.getMaxWithdrawAmount(await alice.getAddress());
      expect(maxInfo[0]).to.equal(ethers.parseEther('100'));
      expect(maxInfo[1]).to.equal(0);
      expect(maxInfo[2]).to.equal(true);

      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('50'), 9);

      maxInfo = await market.getMaxWithdrawAmount(await alice.getAddress());
      expect(maxInfo[0]).to.equal(ethers.parseEther('50'));

      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('50'), 10);
      maxInfo = await market.getMaxWithdrawAmount(await alice.getAddress());
      expect(maxInfo[0]).to.equal(ethers.parseEther('0'));
      expect(maxInfo[1]).to.equal(0);
      expect(maxInfo[2]).to.equal(true);

      await ethers.provider.send('evm_increaseTime', [3600]);
      await ethers.provider.send('evm_mine');

      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('100'), 11);

      await ethers.provider.send('evm_increaseTime', [3600]);
      await ethers.provider.send('evm_mine');

      maxInfo = await market.getMaxWithdrawAmount(await alice.getAddress());
      expect(maxInfo[0]).to.equal(ethers.parseEther('0'));
      expect(maxInfo[1]).to.equal(1);
      expect(maxInfo[2]).to.equal(true);

      await market.connect(matcher1).withdrawAsset(await bob.getAddress(), ethers.parseEther('100'), 12);

      maxInfo = await market.getMaxWithdrawAmount(await carol.getAddress());
      expect(maxInfo[0]).to.equal(ethers.parseEther('0'));
      expect(maxInfo[1]).to.equal(1);
      expect(maxInfo[2]).to.equal(false);

      await ethers.provider.send('evm_increaseTime', [3600 * 6]);
      await ethers.provider.send('evm_mine');
      for (const user of [alice, bob, carol]) {
        maxInfo = await market.getMaxWithdrawAmount(await user.getAddress());
        expect(maxInfo[0]).to.equal(ethers.parseEther('100'));
        expect(maxInfo[1]).to.equal(0);
        expect(maxInfo[2]).to.equal(true);
      }
    });

    it('should reset limits after time passes', async function () {
      const { owner, market, matcher1, alice, usdt } = container;
      await market
        .connect(owner)
        .setWithdrawLimits([{ limit: ethers.parseEther('100'), userLimit: ethers.parseEther('100'), timeWindow: 1 }]);

      const depositAmount = ethers.parseEther('2000');
      await usdt.connect(alice).approve(await market.getAddress(), depositAmount);
      await market.connect(alice).depositAsset(depositAmount);

      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('100'), 13);

      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('1'), 14),
      ).to.be.revertedWithCustomError(market, 'TotalLimitExceeded');

      await ethers.provider.send('evm_increaseTime', [3600]);
      await ethers.provider.send('evm_mine');

      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('100'), 15);
    });

    it('should handle multiple time windows correctly', async function () {
      const { owner, market, matcher1, alice, usdt, bob, carol } = container;

      await market.connect(owner).setWithdrawLimits([
        { limit: ethers.parseEther('200'), userLimit: ethers.parseEther('100'), timeWindow: 1 },
        { limit: ethers.parseEther('300'), userLimit: ethers.parseEther('200'), timeWindow: 6 },
        { limit: ethers.parseEther('3000'), userLimit: ethers.parseEther('2000'), timeWindow: 24 },
      ]);

      const depositAmount = ethers.parseEther('2000');
      await usdt.connect(alice).approve(await market.getAddress(), depositAmount);
      await market.connect(alice).depositAsset(depositAmount);
      await usdt.connect(bob).approve(await market.getAddress(), depositAmount);
      await market.connect(bob).depositAsset(depositAmount);
      await usdt.connect(carol).approve(await market.getAddress(), depositAmount);
      await market.connect(carol).depositAsset(depositAmount);

      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('100'), 16);

      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), 1, 17),
      ).to.be.revertedWithCustomError(market, 'UserLimitExceeded');

      await market.connect(matcher1).withdrawAsset(await bob.getAddress(), ethers.parseEther('100'), 18);

      await expect(
        market.connect(matcher1).withdrawAsset(await carol.getAddress(), ethers.parseEther('1'), 19),
      ).to.be.revertedWithCustomError(market, 'TotalLimitExceeded');

      await ethers.provider.send('evm_increaseTime', [3600]);
      await ethers.provider.send('evm_mine');

      await market.connect(matcher1).withdrawAsset(await carol.getAddress(), ethers.parseEther('100'), 20);

      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('1'), 21),
      ).to.be.revertedWithCustomError(market, 'TotalLimitExceeded');

      await ethers.provider.send('evm_increaseTime', [3600 * 6]);
      await ethers.provider.send('evm_mine');
      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('100'), 22);
      await ethers.provider.send('evm_increaseTime', [3600]);
      await ethers.provider.send('evm_mine');
      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('100'), 23);
      await ethers.provider.send('evm_increaseTime', [3600]);
      await ethers.provider.send('evm_mine');

      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), ethers.parseEther('1'), 24),
      ).to.be.revertedWithCustomError(market, 'UserLimitExceeded');
    });
  });

  describe('RequestId Basic Functionality', function () {
    before(async function () {
      const { owner, market } = container;
      await market.connect(owner).setWithdrawLimits([]);
    });

    it('should allow withdrawal with unique requestId', async function () {
      const { alice, market, usdt, matcher1 } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await market.connect(alice).depositAsset(amount);

      const requestId = 12345;
      await expect(market.connect(matcher1).withdrawAsset(await alice.getAddress(), amount, requestId))
        .to.emit(market, 'UserBalanceChanged')
        .withArgs(await alice.getAddress(), `-${amount.toString()}`, requestId);
    });

    it('should prevent reuse of requestId', async function () {
      const { alice, market, usdt, matcher1 } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount * 2n);
      await market.connect(alice).depositAsset(amount * 2n);

      const requestId = 54321;

      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), amount, requestId);

      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), amount, requestId),
      ).to.be.revertedWithCustomError(market, 'RequestIdAlreadyUsed');
    });

    it('should track used requestIds correctly', async function () {
      const { alice, market, usdt, matcher1 } = container;

      const amount = ethers.parseEther('500');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await market.connect(alice).depositAsset(amount);

      const requestId = 99999;

      expect(await market.requestIds(requestId)).to.equal(0);

      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), amount, requestId);
      expect(await market.requestIds(requestId)).to.equal(1);
    });

    it('should allow different users to use different requestIds', async function () {
      const { alice, bob, market, usdt, matcher1 } = container;

      const amount = ethers.parseEther('500');

      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await market.connect(alice).depositAsset(amount);

      await usdt.connect(bob).approve(await market.getAddress(), amount);
      await market.connect(bob).depositAsset(amount);

      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), amount, 1001);
      await market.connect(matcher1).withdrawAsset(await bob.getAddress(), amount, 1002);

      expect(await market.requestIds(1001)).to.equal(1);
      expect(await market.requestIds(1002)).to.equal(1);
    });
  });

  describe('RequestId Blocking Functionality', function () {
    it('should allow matcher to block requestId', async function () {
      const { matcher1, market } = container;

      const requestId = 77777;

      expect(await market.requestIds(requestId)).to.equal(0);

      await market.connect(matcher1).blockRequestId(requestId);

      expect(await market.requestIds(requestId)).to.equal(2);
    });

    it('should allow admin to block requestId', async function () {
      const { owner, market } = container;

      const requestId = 88888;

      await market.connect(owner).blockRequestId(requestId);

      expect(await market.requestIds(requestId)).to.equal(3);
    });

    it('should prevent non-authorized users from blocking requestId', async function () {
      const { alice, market } = container;

      const requestId = 66666;

      await expect(market.connect(alice).blockRequestId(requestId)).to.be.revertedWithCustomError(
        market,
        'UnauthorizedSigner',
      );
    });

    it('should prevent withdrawal with blocked requestId', async function () {
      const { alice, market, usdt, matcher1 } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await market.connect(alice).depositAsset(amount);

      const requestId = 55555;

      await market.connect(matcher1).blockRequestId(requestId);

      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), amount, requestId),
      ).to.be.revertedWithCustomError(market, 'RequestIdBlocked');
    });

    it('should allow admin to unblock requestId', async function () {
      const { owner, market } = container;

      const requestId = 44444;

      await market.connect(owner).blockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(3);

      await market.connect(owner).unblockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(0);
    });

    it('should fail to unblock non-blocked requestId', async function () {
      const { owner, market } = container;

      const requestId = 22222;

      await expect(market.connect(owner).unblockRequestId(requestId)).to.be.revertedWithCustomError(
        market,
        'InvalidRequestId',
      );
    });

    it('should allow withdrawal after unblocking requestId', async function () {
      const { alice, market, usdt, owner, matcher1 } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await market.connect(alice).depositAsset(amount);

      const requestId = 11111;

      await market.connect(owner).blockRequestId(requestId);

      await expect(
        market.connect(matcher1).withdrawAsset(await alice.getAddress(), amount, requestId),
      ).to.be.revertedWithCustomError(market, 'RequestIdBlocked');

      await market.connect(owner).unblockRequestId(requestId);

      await expect(market.connect(matcher1).withdrawAsset(await alice.getAddress(), amount, requestId))
        .to.emit(market, 'UserBalanceChanged')
        .withArgs(await alice.getAddress(), `-${amount.toString()}`, requestId);
    });

    it('should allow matcher to unblock matcher-blocked requestId', async function () {
      const { matcher1, matcher2, market } = container;

      const requestId = 100001;

      await market.connect(matcher1).blockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(2);

      await market.connect(matcher2).unblockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(0);
    });

    it('should allow admin to unblock matcher-blocked requestId', async function () {
      const { matcher1, owner, market } = container;

      const requestId = 100002;

      await market.connect(matcher1).blockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(2);

      await market.connect(owner).unblockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(0);
    });

    it('should prevent matcher from unblocking admin-blocked requestId', async function () {
      const { matcher1, owner, market } = container;

      const requestId = 100003;

      await market.connect(owner).blockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(3);

      await expect(market.connect(matcher1).unblockRequestId(requestId)).to.be.revertedWithCustomError(
        market,
        'UnauthorizedSigner',
      );
    });

    it('should allow admin to unblock admin-blocked requestId', async function () {
      const { owner, market } = container;

      const requestId = 100004;

      await market.connect(owner).blockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(3);

      await market.connect(owner).unblockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(0);
    });

    it('should prioritize admin role when user has both admin and matcher roles', async function () {
      const { matcher1, owner, market } = container;

      await market.connect(owner).grantRole(await market.DEFAULT_ADMIN_ROLE(), matcher1.address);

      const requestId = 100005;

      await market.connect(matcher1).blockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(3);

      await market.connect(owner).revokeRole(await market.DEFAULT_ADMIN_ROLE(), matcher1.address);
    });

    it('should allow different admin to unblock admin-blocked requestId', async function () {
      const { owner, bob, market } = container;

      await market.connect(owner).grantRole(await market.DEFAULT_ADMIN_ROLE(), bob.address);

      const requestId = 100006;

      await market.connect(owner).blockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(3);

      await market.connect(bob).unblockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(0);

      await market.connect(owner).revokeRole(await market.DEFAULT_ADMIN_ROLE(), bob.address);
    });

    it('should prevent blocking already used requestId', async function () {
      const { alice, market, usdt, matcher1, owner } = container;

      const amount = ethers.parseEther('1000');
      await usdt.connect(alice).approve(await market.getAddress(), amount);
      await market.connect(alice).depositAsset(amount);

      const requestId = 100007;

      await market.connect(matcher1).withdrawAsset(await alice.getAddress(), amount, requestId);
      expect(await market.requestIds(requestId)).to.equal(1);

      await expect(market.connect(matcher1).blockRequestId(requestId)).to.be.revertedWithCustomError(
        market,
        'InvalidRequestId',
      );

      await expect(market.connect(owner).blockRequestId(requestId)).to.be.revertedWithCustomError(
        market,
        'InvalidRequestId',
      );
    });

    it('should prevent blocking already blocked requestId', async function () {
      const { matcher1, matcher2, owner, market } = container;

      const requestId = 100008;

      await market.connect(matcher1).blockRequestId(requestId);
      expect(await market.requestIds(requestId)).to.equal(2);

      await expect(market.connect(matcher2).blockRequestId(requestId)).to.be.revertedWithCustomError(
        market,
        'InvalidRequestId',
      );

      await expect(market.connect(owner).blockRequestId(requestId)).to.be.revertedWithCustomError(
        market,
        'InvalidRequestId',
      );
    });
  });
});
