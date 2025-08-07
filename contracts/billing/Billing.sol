// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Storage} from "../storage/Storage.sol";

contract Billing is Initializable, OwnableUpgradeable, PausableUpgradeable, UUPSUpgradeable {
  using SafeERC20 for IERC20;

  struct Subscription {
    string id;
    address owner;
    uint256 maxAmount; // Maximum amount per charge
    uint256 minPeriod; // Minimum time between charges (in seconds)
    uint256 lastChargeTime; // Last time user was charged
    bool active; // Whether subscription is active
  }

  struct SubscriptionPlan {
    uint256 amount; // Cost per billing cycle
    uint256 period; // Billing period in seconds
  }

  struct SubscriptionPlanInput {
    string planId;
    uint256 amount;
    uint256 period;
  }

  address public info;

  mapping(string => Subscription) public subscriptions;
  mapping(string => SubscriptionPlan) public subscriptionPlans;

  event UserCharged(address indexed user, uint256 amount, string indexed subscriptionId);
  event SubscriptionCreated(string indexed subscriptionId, address indexed user, uint256 maxAmount, uint256 minPeriod);
  event SubscriptionCancelled(string indexed subscriptionId);
  event SubscriptionPlanCreated(string indexed planId, uint256 amount, uint256 period);
  event SubscriptionPlansUpdated(uint256 planCount);
  event FundsWithdrawn(address indexed to, uint256 amount);

  error Forbidden();
  error MaxAmountExceeded(address user, uint256 requested, uint256 available);
  error PeriodNotPassed(uint256 lastCharge, uint256 minInterval);
  error SubscriptionNotFound(string subscriptionId);
  error SubscriptionAlreadyExists(string subscriptionId);
  error InvalidAmount();
  error InvalidPeriod();
  error InsufficientTokenBalance(address user, uint256 required, uint256 available);
  error SubscriptionInactive(string subscriptionId);
  error InvalidAddress(address addr);

  uint256[49] __gap;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function initialize(
    address _info,
    address _owner,
    SubscriptionPlanInput[] calldata _initialPlans
  ) public initializer {
    __Ownable_init(_owner);
    __Pausable_init();
    __UUPSUpgradeable_init();
    info = _info;
    for (uint i = 0; i < _initialPlans.length; i++) {
      if (_initialPlans[i].amount == 0) revert InvalidAmount();
      if (_initialPlans[i].period == 0) revert InvalidPeriod();

      subscriptionPlans[_initialPlans[i].planId] = SubscriptionPlan({
        amount: _initialPlans[i].amount,
        period: _initialPlans[i].period
      });

      emit SubscriptionPlanCreated(_initialPlans[i].planId, _initialPlans[i].amount, _initialPlans[i].period);
    }
  }

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  /**
   * @dev Sets subscription plans, clearing existing ones first
   */
  function setSubscriptionPlans(
    SubscriptionPlanInput[] calldata plans,
    string[] calldata planIdsToRemove
  ) external onlyOwner {
    for (uint256 i = 0; i < planIdsToRemove.length; i++) {
      delete subscriptionPlans[planIdsToRemove[i]];
    }
    for (uint256 i = 0; i < plans.length; i++) {
      if (plans[i].amount == 0) revert InvalidAmount();
      if (plans[i].period == 0) revert InvalidPeriod();
      subscriptionPlans[plans[i].planId] = SubscriptionPlan({amount: plans[i].amount, period: plans[i].period});
      emit SubscriptionPlanCreated(plans[i].planId, plans[i].amount, plans[i].period);
    }
    emit SubscriptionPlansUpdated(plans.length);
  }

  /**
   * @dev User subscribes to a plan
   */
  function subscribe(string calldata subscriptionId, string calldata planId) external whenNotPaused {
    if (subscriptions[subscriptionId].active) {
      revert SubscriptionAlreadyExists(subscriptionId);
    }
    SubscriptionPlan memory plan = subscriptionPlans[planId];
    if (plan.amount == 0) revert SubscriptionNotFound(planId);

    subscriptions[subscriptionId] = Subscription({
      id: subscriptionId,
      owner: _msgSender(),
      maxAmount: plan.amount,
      minPeriod: plan.period,
      lastChargeTime: 0,
      active: true
    });
    emit SubscriptionCreated(subscriptionId, _msgSender(), plan.amount, plan.period);
  }

  /**
   * @dev Manager charges user for subscription
   */
  function chargeUser(string calldata subscriptionId, uint256 amount) external whenNotPaused {
    bool isCallAllowed = Storage(info).getBool(keccak256(abi.encodePacked("EH:Billing:Manager:", _msgSender())));
    if (!isCallAllowed) revert Forbidden();

    Subscription storage subscription = subscriptions[subscriptionId];
    if (!subscription.active) revert SubscriptionInactive(subscriptionId);
    if (amount > subscription.maxAmount) {
      revert MaxAmountExceeded(subscription.owner, amount, subscription.maxAmount);
    }

    if (subscription.lastChargeTime != 0) {
      uint256 timeSinceLastCharge = block.timestamp - subscription.lastChargeTime;
      if (timeSinceLastCharge < subscription.minPeriod) {
        revert PeriodNotPassed(subscription.lastChargeTime, subscription.minPeriod);
      }
    }

    IERC20 paymentToken = _getPaymentToken();
    paymentToken.safeTransferFrom(subscription.owner, address(this), amount);
    subscription.lastChargeTime = block.timestamp;
    emit UserCharged(subscription.owner, amount, subscriptionId);
  }

  /**
   * @dev User cancels their own subscription
   */
  function cancelSubscription(string calldata subscriptionId) external {
    Subscription storage subscription = subscriptions[subscriptionId];
    if (subscription.owner != _msgSender()) {
      revert Forbidden();
    }
    _cancelSubscription(subscriptionId);
  }

  /**
   * @dev Manager cancels user subscription
   */
  function cancelSubscriptionByManager(string calldata subscriptionId) external {
    bool isCallAllowed = Storage(info).getBool(keccak256(abi.encodePacked("EH:Billing:Manager:", _msgSender())));
    if (!isCallAllowed) revert Forbidden();
    _cancelSubscription(subscriptionId);
  }

  /**
   * @dev Internal function to cancel subscription
   */
  function _cancelSubscription(string calldata subscriptionId) internal {
    Subscription storage subscription = subscriptions[subscriptionId];
    if (!subscription.active) revert SubscriptionNotFound(subscriptionId);

    subscription.active = false;

    emit SubscriptionCancelled(subscriptionId);
  }

  /**
   * @dev Owner withdraws collected funds
   */
  function withdrawFunds(address to, uint256 amount) external onlyOwner {
    if (to == address(0)) revert InvalidAddress(to);
    IERC20 paymentToken = _getPaymentToken();
    paymentToken.safeTransfer(to, amount);
    emit FundsWithdrawn(to, amount);
  }

  function getSubscription(string calldata subscriptionId) external view returns (Subscription memory) {
    return subscriptions[subscriptionId];
  }

  function getTimeUntilNextCharge(string calldata subscriptionId) external view returns (uint256) {
    Subscription memory subscription = subscriptions[subscriptionId];
    if (subscription.lastChargeTime == 0) return 0;
    uint256 timeSinceLastCharge = block.timestamp - subscription.lastChargeTime;
    if (timeSinceLastCharge >= subscription.minPeriod) return 0;
    return subscription.minPeriod - timeSinceLastCharge;
  }

  function getPaymentToken() external view returns (address) {
    return address(_getPaymentToken());
  }

  function getUserAllowance(address user) external view returns (uint256) {
    IERC20 paymentToken = _getPaymentToken();
    return paymentToken.allowance(user, address(this));
  }

  function _getPaymentToken() internal view returns (IERC20) {
    address tokenAddress = Storage(info).getAddress(keccak256("EH:Billing:PaymentToken"));
    return IERC20(tokenAddress);
  }
}
