'use strict';

const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const BN = require('big.js');

const key = (k) => ethers.keccak256(ethers.toUtf8Bytes(k));

describe('Billing', function () {
  let owner, user1, user2, manager1, manager2, nonManager;
  let billing, erc20, storage;
  const zeroAddress = '0x0000000000000000000000000000000000000000';

  // Test data constants
  const PLAN_IDS = {
    BASIC: 'basic-plan',
    PREMIUM: 'premium-plan',
    ENTERPRISE: 'enterprise-plan',
  };

  const PLANS = {
    BASIC: {
      planId: PLAN_IDS.BASIC,
      amount: new BN(100).mul('1e18').toFixed(0), // 100 tokens
      period: 30 * 24 * 60 * 60, // 30 days in seconds
    },
    PREMIUM: {
      planId: PLAN_IDS.PREMIUM,
      amount: new BN(500).mul('1e18').toFixed(0), // 500 tokens
      period: 30 * 24 * 60 * 60, // 30 days in seconds
    },
    ENTERPRISE: {
      planId: PLAN_IDS.ENTERPRISE,
      amount: new BN(2000).mul('1e18').toFixed(0), // 2000 tokens
      period: 30 * 24 * 60 * 60, // 30 days in seconds
    },
  };

  before(async function () {
    [owner, user1, user2, manager1, manager2, nonManager] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    erc20 = await ERC20Mock.deploy();

    // Deploy storage contract
    const Storage = await ethers.getContractFactory('Storage');
    storage = await Storage.deploy();

    // Set payment token in storage
    await storage.setAddress(key('EH:Billing:PaymentToken'), await erc20.getAddress());

    // Set manager permissions
    await storage.setBool(
      ethers.solidityPackedKeccak256(['string', 'address'], ['EH:Billing:Manager:', await manager1.getAddress()]),
      true,
    );
    await storage.setBool(
      ethers.solidityPackedKeccak256(['string', 'address'], ['EH:Billing:Manager:', await manager2.getAddress()]),
      true,
    );

    // Deploy Billing contract with initial plans
    const Billing = await ethers.getContractFactory('Billing');
    const initialPlans = [PLANS.BASIC, PLANS.PREMIUM];
    billing = await upgrades.deployProxy(Billing, [await storage.getAddress(), await owner.getAddress(), initialPlans]);

    // Mint tokens to users for testing
    const mintAmount = new BN(10000).mul('1e18').toFixed(0);
    await erc20.mint(await user1.getAddress(), mintAmount);
    await erc20.mint(await user2.getAddress(), mintAmount);
  });

  describe('Initialization', function () {
    it('Should initialize with correct owner and info', async function () {
      expect(await billing.owner()).to.equal(await owner.getAddress());
      expect(await billing.info()).to.equal(await storage.getAddress());
    });

    it('Should initialize with initial subscription plans', async function () {
      const basicPlan = await billing.subscriptionPlans(PLAN_IDS.BASIC);
      expect(basicPlan.amount).to.equal(PLANS.BASIC.amount);
      expect(basicPlan.period).to.equal(PLANS.BASIC.period);

      const premiumPlan = await billing.subscriptionPlans(PLAN_IDS.PREMIUM);
      expect(premiumPlan.amount).to.equal(PLANS.PREMIUM.amount);
      expect(premiumPlan.period).to.equal(PLANS.PREMIUM.period);
    });

    it('Should revert initialization with invalid plan amount', async function () {
      const Billing = await ethers.getContractFactory('Billing');
      const invalidPlans = [
        {
          planId: 'invalid-plan',
          amount: 0,
          period: 30 * 24 * 60 * 60,
        },
      ];

      await expect(
        upgrades.deployProxy(Billing, [await storage.getAddress(), await owner.getAddress(), invalidPlans]),
      ).to.be.revertedWithCustomError(billing, 'InvalidAmount');
    });

    it('Should revert initialization with invalid plan period', async function () {
      const Billing = await ethers.getContractFactory('Billing');
      const invalidPlans = [
        {
          planId: 'invalid-plan',
          amount: new BN(100).mul('1e18').toFixed(0),
          period: 0,
        },
      ];

      await expect(
        upgrades.deployProxy(Billing, [await storage.getAddress(), await owner.getAddress(), invalidPlans]),
      ).to.be.revertedWithCustomError(billing, 'InvalidPeriod');
    });
  });

  describe('Subscription Plan Management', function () {
    it('Should allow owner to set new subscription plans', async function () {
      const newPlans = [PLANS.ENTERPRISE];
      const plansToRemove = [PLAN_IDS.BASIC];

      await expect(billing.connect(owner).setSubscriptionPlans(newPlans, plansToRemove))
        .to.emit(billing, 'SubscriptionPlanCreated')
        .withArgs(PLANS.ENTERPRISE.planId, PLANS.ENTERPRISE.amount, PLANS.ENTERPRISE.period)
        .to.emit(billing, 'SubscriptionPlansUpdated')
        .withArgs(newPlans.length);

      // Verify basic plan was removed
      const removedPlan = await billing.subscriptionPlans(PLAN_IDS.BASIC);
      expect(removedPlan.amount).to.equal(0);
      expect(removedPlan.period).to.equal(0);

      // Verify enterprise plan was added
      const enterprisePlan = await billing.subscriptionPlans(PLAN_IDS.ENTERPRISE);
      expect(enterprisePlan.amount).to.equal(PLANS.ENTERPRISE.amount);
      expect(enterprisePlan.period).to.equal(PLANS.ENTERPRISE.period);
    });

    it('Should revert setting plans with invalid amount', async function () {
      const invalidPlans = [
        {
          planId: 'invalid-plan',
          amount: 0,
          period: 30 * 24 * 60 * 60,
        },
      ];

      await expect(billing.connect(owner).setSubscriptionPlans(invalidPlans, [])).to.be.revertedWithCustomError(
        billing,
        'InvalidAmount',
      );
    });

    it('Should revert setting plans with invalid period', async function () {
      const invalidPlans = [
        {
          planId: 'invalid-plan',
          amount: new BN(100).mul('1e18').toFixed(0),
          period: 0,
        },
      ];

      await expect(billing.connect(owner).setSubscriptionPlans(invalidPlans, [])).to.be.revertedWithCustomError(
        billing,
        'InvalidPeriod',
      );
    });

    it('Should revert when non-owner tries to set plans', async function () {
      const newPlans = [PLANS.BASIC];
      await expect(billing.connect(user1).setSubscriptionPlans(newPlans, [])).to.be.revertedWithCustomError(
        billing,
        'OwnableUnauthorizedAccount',
      );
    });
  });

  describe('Subscription Management', function () {
    beforeEach(async function () {
      // Restore basic and premium plans for subscription tests
      const plans = [PLANS.BASIC, PLANS.PREMIUM];
      await billing.connect(owner).setSubscriptionPlans(plans, []);
    });

    it('Should allow user to subscribe to a plan', async function () {
      const subscriptionId = `user1-basic-sub-${Math.random().toString(36).substring(2, 15)}`;
      await expect(billing.connect(user1).subscribe(subscriptionId, PLAN_IDS.BASIC))
        .to.emit(billing, 'SubscriptionCreated')
        .withArgs(subscriptionId, await user1.getAddress(), PLANS.BASIC.amount, PLANS.BASIC.period);

      const subscription = await billing.subscriptions(subscriptionId);
      expect(subscription.owner).to.equal(await user1.getAddress());
      expect(subscription.maxAmount).to.equal(PLANS.BASIC.amount);
      expect(subscription.minPeriod).to.equal(PLANS.BASIC.period);
      expect(subscription.lastChargeTime).to.equal(0);
      expect(subscription.active).to.be.true;
    });

    it('Should revert when subscribing to non-existent plan', async function () {
      const subscriptionId = `user1-basic-sub-${Math.random().toString(36).substring(2, 15)}`;
      await expect(billing.connect(user1).subscribe(subscriptionId, 'non-existent-plan')).to.be.revertedWithCustomError(
        billing,
        'SubscriptionPlanNotFound',
      );
    });

    it('Should revert when subscribing with existing subscription ID', async function () {
      const subscriptionId = `user1-basic-sub-${Math.random().toString(36).substring(2, 15)}`;
      await billing.connect(user1).subscribe(subscriptionId, PLAN_IDS.BASIC);
      await expect(billing.connect(user1).subscribe(subscriptionId, PLAN_IDS.PREMIUM)).to.be.revertedWithCustomError(
        billing,
        'SubscriptionAlreadyExists',
      );
    });

    it('Should revert when contract is paused', async function () {
      await billing.connect(owner).pause();
      await expect(billing.connect(user1).subscribe('paused-sub', PLAN_IDS.BASIC)).to.be.revertedWithCustomError(
        billing,
        'EnforcedPause',
      );
      await billing.connect(owner).unpause();
    });
  });

  describe('Charging Users', function () {
    const SUBSCRIPTION_IDS = {
      USER1_BASIC: `user1-basic-sub-${Math.random().toString(36).substring(2, 15)}`,
      USER2_BASIC: `user2-basic-sub-${Math.random().toString(36).substring(2, 15)}`,
    };

    before(async function () {
      await billing.connect(user1).subscribe(SUBSCRIPTION_IDS.USER1_BASIC, PLAN_IDS.BASIC);
      await billing.connect(user2).subscribe(SUBSCRIPTION_IDS.USER2_BASIC, PLAN_IDS.BASIC);
    });

    beforeEach(async function () {
      const approveAmount = new BN(5000).mul('1e18').toFixed(0);
      await erc20.connect(user1).approve(await billing.getAddress(), approveAmount);
      await erc20.connect(user2).approve(await billing.getAddress(), approveAmount);
      await ethers.provider.send('evm_increaseTime', [PLANS.BASIC.period + 1]);
      await ethers.provider.send('evm_mine');
    });

    it('Should allow manager to charge user', async function () {
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);
      const billingAddress = await billing.getAddress();

      const initialUserBalance = await erc20.balanceOf(await user1.getAddress());
      const initialContractBalance = await erc20.balanceOf(billingAddress);

      await expect(billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount))
        .to.emit(billing, 'UserCharged')
        .withArgs(await user1.getAddress(), chargeAmount, SUBSCRIPTION_IDS.USER1_BASIC);

      // Verify token transfer
      const finalUserBalance = await erc20.balanceOf(await user1.getAddress());
      const finalContractBalance = await erc20.balanceOf(billingAddress);

      expect(finalUserBalance).to.equal(BigInt(initialUserBalance) - BigInt(chargeAmount));
      expect(finalContractBalance).to.equal(BigInt(initialContractBalance) + BigInt(chargeAmount));

      // Verify subscription state update
      const subscription = await billing.subscriptions(SUBSCRIPTION_IDS.USER1_BASIC);
      expect(subscription.lastChargeTime).to.be.greaterThan(0);
    });

    it('Should allow charging up to max amount', async function () {
      await expect(billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, PLANS.BASIC.amount)).to.emit(
        billing,
        'UserCharged',
      );
    });

    it('Should revert when charging more than max amount', async function () {
      const excessAmount = new BN(PLANS.BASIC.amount).plus(1).toFixed(0);
      await expect(
        billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, excessAmount),
      ).to.be.revertedWithCustomError(billing, 'MaxAmountExceeded');
    });

    it('Should revert when charging too frequently', async function () {
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);

      // First charge
      await billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount);

      // Second charge immediately (should fail due to period limit)
      await expect(
        billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount),
      ).to.be.revertedWithCustomError(billing, 'PeriodNotPassed');
    });

    it('Should allow charging after period has passed', async function () {
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);

      // First charge
      await billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount);

      // Fast forward time beyond period
      await ethers.provider.send('evm_increaseTime', [PLANS.BASIC.period + 1]);
      await ethers.provider.send('evm_mine');

      // Second charge should succeed
      await expect(billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount)).to.emit(
        billing,
        'UserCharged',
      );
    });

    it('Should revert when non-manager tries to charge', async function () {
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);

      await expect(
        billing.connect(nonManager).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount),
      ).to.be.revertedWithCustomError(billing, 'Forbidden');
    });

    it('Should revert when charging inactive subscription', async function () {
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);

      // Cancel subscription first
      await billing.connect(user1).cancelSubscription(SUBSCRIPTION_IDS.USER1_BASIC);

      await expect(
        billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount),
      ).to.be.revertedWithCustomError(billing, 'SubscriptionInactive');
    });

    it('Should revert when user has insufficient token balance', async function () {
      // Transfer away most of user's tokens
      const userBalance = await erc20.balanceOf(await user1.getAddress());
      const transferAmount = BigInt(userBalance) - BigInt(new BN(10).mul('1e18').toFixed(0));
      await erc20.connect(user1).transfer(await user2.getAddress(), transferAmount);
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);
      await expect(billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount)).to.be.reverted; // Will be reverted by SafeERC20
      await erc20.connect(user2).transfer(await user1.getAddress(), transferAmount);
    });

    it('Should revert when user has insufficient allowance', async function () {
      // Reset allowance to less than charge amount
      await erc20.connect(user1).approve(await billing.getAddress(), 0);
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);
      await expect(billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount)).to.be.reverted; // Will be reverted by SafeERC20
    });

    it('Should revert when contract is paused', async function () {
      await billing.connect(owner).pause();
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);
      await expect(
        billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount),
      ).to.be.revertedWithCustomError(billing, 'EnforcedPause');

      await billing.connect(owner).unpause();
    });
  });

  describe('Subscription Cancellation', function () {
    const SUBSCRIPTION_IDS = {
      USER1_BASIC: '',
      USER2_BASIC: '',
    };

    beforeEach(async function () {
      SUBSCRIPTION_IDS.USER1_BASIC = `user1-basic-sub-${Math.random().toString(36).substring(2, 15)}`;
      SUBSCRIPTION_IDS.USER2_BASIC = `user2-basic-sub-${Math.random().toString(36).substring(2, 15)}`;
      await billing.connect(user1).subscribe(SUBSCRIPTION_IDS.USER1_BASIC, PLAN_IDS.BASIC);
      await billing.connect(user2).subscribe(SUBSCRIPTION_IDS.USER2_BASIC, PLAN_IDS.BASIC);
    });

    it('Should allow user to cancel their own subscription', async function () {
      await expect(billing.connect(user1).cancelSubscription(SUBSCRIPTION_IDS.USER1_BASIC))
        .to.emit(billing, 'SubscriptionCancelled')
        .withArgs(SUBSCRIPTION_IDS.USER1_BASIC);

      const subscription = await billing.subscriptions(SUBSCRIPTION_IDS.USER1_BASIC);
      expect(subscription.active).to.be.false;
    });

    it('Should allow manager to cancel user subscription', async function () {
      await expect(billing.connect(manager1).cancelSubscriptionByManager(SUBSCRIPTION_IDS.USER1_BASIC))
        .to.emit(billing, 'SubscriptionCancelled')
        .withArgs(SUBSCRIPTION_IDS.USER1_BASIC);

      const subscription = await billing.subscriptions(SUBSCRIPTION_IDS.USER1_BASIC);
      expect(subscription.active).to.be.false;
    });

    it("Should revert when user tries to cancel another user's subscription", async function () {
      await expect(
        billing.connect(user2).cancelSubscription(SUBSCRIPTION_IDS.USER1_BASIC),
      ).to.be.revertedWithCustomError(billing, 'Forbidden');
    });

    it('Should revert when non-manager tries to cancel subscription', async function () {
      await expect(
        billing.connect(nonManager).cancelSubscriptionByManager(SUBSCRIPTION_IDS.USER1_BASIC),
      ).to.be.revertedWithCustomError(billing, 'Forbidden');
    });

    it('Should revert when cancelling already inactive subscription', async function () {
      await billing.connect(user1).cancelSubscription(SUBSCRIPTION_IDS.USER1_BASIC);

      await expect(
        billing.connect(user1).cancelSubscription(SUBSCRIPTION_IDS.USER1_BASIC),
      ).to.be.revertedWithCustomError(billing, 'SubscriptionNotFound');
    });
  });

  describe('Fund Management', function () {
    const SUBSCRIPTION_IDS = {
      USER1_BASIC: '',
    };

    beforeEach(async function () {
      SUBSCRIPTION_IDS.USER1_BASIC = `user1-basic-sub-${Math.random().toString(36).substring(2, 15)}`;
      await billing.connect(user1).subscribe(SUBSCRIPTION_IDS.USER1_BASIC, PLAN_IDS.BASIC);
      const approveAmount = new BN(1000).mul('1e18').toFixed(0);
      await erc20.connect(user1).approve(await billing.getAddress(), approveAmount);
      const chargeAmount = new BN(100).mul('1e18').toFixed(0);
      await billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount);
    });

    it('Should allow owner to withdraw funds', async function () {
      const withdrawAmount = new BN(50).mul('1e18').toFixed(0);
      const recipient = await user2.getAddress();

      const initialRecipientBalance = await erc20.balanceOf(recipient);

      await expect(billing.connect(owner).withdrawFunds(recipient, withdrawAmount))
        .to.emit(billing, 'FundsWithdrawn')
        .withArgs(recipient, withdrawAmount);

      const finalRecipientBalance = await erc20.balanceOf(recipient);
      expect(finalRecipientBalance).to.equal(BigInt(initialRecipientBalance) + BigInt(withdrawAmount));
    });

    it('Should revert withdrawal to zero address', async function () {
      const withdrawAmount = new BN(50).mul('1e18').toFixed(0);

      await expect(billing.connect(owner).withdrawFunds(zeroAddress, withdrawAmount)).to.be.revertedWithCustomError(
        billing,
        'InvalidAddress',
      );
    });

    it('Should revert when non-owner tries to withdraw', async function () {
      const withdrawAmount = new BN(50).mul('1e18').toFixed(0);

      await expect(
        billing.connect(user1).withdrawFunds(await user1.getAddress(), withdrawAmount),
      ).to.be.revertedWithCustomError(billing, 'OwnableUnauthorizedAccount');
    });

    it('Should revert when withdrawing more than available balance', async function () {
      const contractBalance = await erc20.balanceOf(await billing.getAddress());
      const excessAmount = BigInt(contractBalance) + BigInt(new BN(100).mul('1e18').toFixed(0));

      await expect(billing.connect(owner).withdrawFunds(await user1.getAddress(), excessAmount.toString())).to.be
        .reverted; // Will be reverted by SafeERC20
    });
  });

  describe('View Methods', function () {
    const SUBSCRIPTION_IDS = {
      USER1_BASIC: '',
      USER2_PREMIUM: '',
    };

    beforeEach(async function () {
      const plans = [PLANS.BASIC, PLANS.PREMIUM];
      await billing.connect(owner).setSubscriptionPlans(plans, []);

      SUBSCRIPTION_IDS.USER1_BASIC = `user1-basic-sub-${Math.random().toString(36).substring(2, 15)}`;
      SUBSCRIPTION_IDS.USER2_PREMIUM = `user2-premium-sub-${Math.random().toString(36).substring(2, 15)}`;

      await billing.connect(user1).subscribe(SUBSCRIPTION_IDS.USER1_BASIC, PLAN_IDS.BASIC);
      await billing.connect(user2).subscribe(SUBSCRIPTION_IDS.USER2_PREMIUM, PLAN_IDS.PREMIUM);

      const approveAmount = new BN(5000).mul('1e18').toFixed(0);
      await erc20.connect(user1).approve(await billing.getAddress(), approveAmount);
      await erc20.connect(user2).approve(await billing.getAddress(), approveAmount);
    });

    it('Should return correct subscription details', async function () {
      const subscription = await billing.subscriptions(SUBSCRIPTION_IDS.USER1_BASIC);

      expect(subscription.owner).to.equal(await user1.getAddress());
      expect(subscription.maxAmount).to.equal(PLANS.BASIC.amount);
      expect(subscription.minPeriod).to.equal(PLANS.BASIC.period);
      expect(subscription.lastChargeTime).to.equal(0);
      expect(subscription.active).to.be.true;
    });

    it('Should return subscription with updated lastChargeTime after charging', async function () {
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);

      // Charge user
      await billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount);

      const subscription = await billing.subscriptions(SUBSCRIPTION_IDS.USER1_BASIC);
      expect(subscription.lastChargeTime).to.be.greaterThan(0);
    });

    it('Should return inactive subscription after cancellation', async function () {
      await billing.connect(user1).cancelSubscription(SUBSCRIPTION_IDS.USER1_BASIC);
      const subscription = await billing.subscriptions(SUBSCRIPTION_IDS.USER1_BASIC);
      expect(subscription.active).to.be.false;
    });

    it('Should return 0 for subscription that has never been charged', async function () {
      const timeUntilNext = await billing.getTimeUntilNextCharge(SUBSCRIPTION_IDS.USER1_BASIC);
      expect(timeUntilNext).to.equal(0);
    });

    it('Should return correct time remaining after first charge', async function () {
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);

      // Charge user
      await billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount);

      const timeUntilNext = await billing.getTimeUntilNextCharge(SUBSCRIPTION_IDS.USER1_BASIC);

      // Should be close to the full period (allowing for small timing differences)
      expect(Number(timeUntilNext)).to.be.greaterThan(PLANS.BASIC.period - 10);
      expect(Number(timeUntilNext)).to.be.lessThanOrEqual(PLANS.BASIC.period);
    });

    it('Should return 0 when enough time has passed since last charge', async function () {
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);

      // Charge user
      await billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount);

      // Fast forward time beyond the period
      await ethers.provider.send('evm_increaseTime', [PLANS.BASIC.period + 100]);
      await ethers.provider.send('evm_mine');

      const timeUntilNext = await billing.getTimeUntilNextCharge(SUBSCRIPTION_IDS.USER1_BASIC);
      expect(timeUntilNext).to.equal(0);
    });

    it('Should return decreasing time as time progresses', async function () {
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);

      // Charge user
      await billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount);

      const initialTimeUntilNext = await billing.getTimeUntilNextCharge(SUBSCRIPTION_IDS.USER1_BASIC);

      // Wait some time
      await ethers.provider.send('evm_increaseTime', [3600]); // 1 hour
      await ethers.provider.send('evm_mine');

      const laterTimeUntilNext = await billing.getTimeUntilNextCharge(SUBSCRIPTION_IDS.USER1_BASIC);

      expect(Number(laterTimeUntilNext)).to.be.lessThan(Number(initialTimeUntilNext));
      expect(Number(laterTimeUntilNext)).to.be.approximately(Number(initialTimeUntilNext) - 3600, 5);
    });

    it('Should return 0 for non-existent subscription', async function () {
      const timeUntilNext = await billing.getTimeUntilNextCharge('non-existent-id');
      expect(timeUntilNext).to.equal(0);
    });

    it('Should return correct payment token address', async function () {
      const paymentTokenAddress = await billing.getPaymentToken();
      expect(paymentTokenAddress).to.equal(await erc20.getAddress());
    });

    it('Should return updated payment token after storage change', async function () {
      // Deploy a new mock token
      const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
      const newToken = await ERC20Mock.deploy();

      // Update payment token in storage
      await storage.setAddress(key('EH:Billing:PaymentToken'), await newToken.getAddress());

      const paymentTokenAddress = await billing.getPaymentToken();
      expect(paymentTokenAddress).to.equal(await newToken.getAddress());

      // Revert back for other tests
      await storage.setAddress(key('EH:Billing:PaymentToken'), await erc20.getAddress());
    });

    it('Should return correct allowance for user', async function () {
      const expectedAllowance = new BN(5000).mul('1e18').toFixed(0);

      const allowance = await billing.getUserAllowance(await user1.getAddress());
      expect(allowance).to.equal(expectedAllowance);
    });

    it('Should return correct plan details', async function () {
      const basicPlan = await billing.subscriptionPlans(PLAN_IDS.BASIC);
      expect(basicPlan.amount).to.equal(PLANS.BASIC.amount);
      expect(basicPlan.period).to.equal(PLANS.BASIC.period);

      const premiumPlan = await billing.subscriptionPlans(PLAN_IDS.PREMIUM);
      expect(premiumPlan.amount).to.equal(PLANS.PREMIUM.amount);
      expect(premiumPlan.period).to.equal(PLANS.PREMIUM.period);
    });

    it('Should reflect changes after plan updates', async function () {
      const newPlans = [PLANS.ENTERPRISE];
      const plansToRemove = [PLAN_IDS.BASIC, PLAN_IDS.PREMIUM];

      await billing.connect(owner).setSubscriptionPlans(newPlans, plansToRemove);

      // Old plans should be removed
      const basicPlan = await billing.subscriptionPlans(PLAN_IDS.BASIC);
      expect(basicPlan.amount).to.equal(0);
      expect(basicPlan.period).to.equal(0);

      // New plan should be available
      const enterprisePlan = await billing.subscriptionPlans(PLAN_IDS.ENTERPRISE);
      expect(enterprisePlan.amount).to.equal(PLANS.ENTERPRISE.amount);
      expect(enterprisePlan.period).to.equal(PLANS.ENTERPRISE.period);
    });

    it('Should return correct subscription details directly from mapping', async function () {
      const subscription = await billing.subscriptions(SUBSCRIPTION_IDS.USER1_BASIC);

      expect(subscription.owner).to.equal(await user1.getAddress());
      expect(subscription.maxAmount).to.equal(PLANS.BASIC.amount);
      expect(subscription.minPeriod).to.equal(PLANS.BASIC.period);
      expect(subscription.lastChargeTime).to.equal(0);
      expect(subscription.active).to.be.true;
    });

    it('Should show consistent time calculations', async function () {
      const chargeAmount = new BN(50).mul('1e18').toFixed(0);

      // Charge user and record timestamp
      const tx = await billing.connect(manager1).chargeUser(SUBSCRIPTION_IDS.USER1_BASIC, chargeAmount);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const chargeTimestamp = block.timestamp;

      const subscription = await billing.subscriptions(SUBSCRIPTION_IDS.USER1_BASIC);
      const timeUntilNext = await billing.getTimeUntilNextCharge(SUBSCRIPTION_IDS.USER1_BASIC);

      // Verify that lastChargeTime matches the block timestamp
      expect(Number(subscription.lastChargeTime)).to.equal(chargeTimestamp);

      // Verify time calculation
      const expectedTimeUntilNext = PLANS.BASIC.period;
      expect(Number(timeUntilNext)).to.be.approximately(expectedTimeUntilNext, 2);
    });
  });
});
