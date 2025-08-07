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
    address owner;
    uint64 lastChargeTime;
    bool active;
    uint128 maxAmount;
    uint128 minPeriod;
  }

  struct SubscriptionPlan {
    uint128 amount;
    uint128 period;
  }

  struct SubscriptionPlanInput {
    string planId;
    uint128 amount;
    uint128 period;
  }

  address public info;

  mapping(string => Subscription) public subscriptions;
  mapping(string => SubscriptionPlan) public subscriptionPlans;

  event UserCharged(address indexed user, uint256 amount, string indexed subscriptionId);
  event SubscriptionCreated(string indexed subscriptionId, address indexed user, uint256 maxAmount, uint256 minPeriod);
  event SubscriptionCancelled(string indexed subscriptionId);
  event SubscriptionPlanCreated(string indexed planId, uint128 amount, uint128 period);
  event SubscriptionPlansUpdated(uint256 planCount);
  event FundsWithdrawn(address indexed to, uint256 amount);

  error Forbidden(address caller);
  error MaxAmountExceeded(address user, uint128 requested, uint128 available);
  error PeriodNotPassed(uint64 lastCharge, uint128 minInterval, uint256 timeRemaining);
  error SubscriptionNotFound(string subscriptionId);
  error SubscriptionPlanNotFound(string planId);
  error SubscriptionAlreadyExists(string subscriptionId);
  error InvalidAmount(uint128 amount);
  error InvalidPeriod(uint128 period);
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

    if (_info == address(0)) revert InvalidAddress(_info);
    info = _info;
    _setSubscriptionPlansInternal(_initialPlans);
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
    uint256 removeLength = planIdsToRemove.length;
    uint256 addLength = plans.length;
    for (uint256 i; i < removeLength; i++) {
      delete subscriptionPlans[planIdsToRemove[i]];
    }
    _setSubscriptionPlansInternal(plans);
    emit SubscriptionPlansUpdated(addLength);
  }

  /**
   * @dev User subscribes to a plan
   */
  function subscribe(string calldata subscriptionId, string calldata planId) external whenNotPaused {
    Subscription storage existingSub = subscriptions[subscriptionId];
    if (existingSub.owner != address(0)) {
      revert SubscriptionAlreadyExists(subscriptionId);
    }
    SubscriptionPlan storage plan = subscriptionPlans[planId];
    if (plan.amount == 0) revert SubscriptionPlanNotFound(planId);
    existingSub.owner = _msgSender();
    existingSub.maxAmount = plan.amount;
    existingSub.minPeriod = plan.period;
    existingSub.lastChargeTime = 0;
    existingSub.active = true;
    emit SubscriptionCreated(subscriptionId, _msgSender(), plan.amount, plan.period);
  }

  /**
   * @dev Manager charges user for subscription
   */
  function chargeUser(string calldata subscriptionId, uint256 amount) external whenNotPaused {
    bool isCallAllowed = Storage(info).getBool(keccak256(abi.encodePacked("EH:Billing:Manager:", _msgSender())));
    if (!isCallAllowed) revert Forbidden(_msgSender());

    Subscription storage subscription = subscriptions[subscriptionId];
    address subOwner = subscription.owner;
    if (subOwner == address(0)) revert SubscriptionNotFound(subscriptionId);
    if (!subscription.active) revert SubscriptionInactive(subscriptionId);
    if (amount > subscription.maxAmount) {
      revert MaxAmountExceeded(subOwner, uint128(amount), subscription.maxAmount);
    }

    uint64 lastCharge = subscription.lastChargeTime;
    if (lastCharge != 0) {
      uint256 timeSinceLastCharge = block.timestamp - lastCharge;
      uint128 minPeriod = subscription.minPeriod;
      if (timeSinceLastCharge < minPeriod) {
        revert PeriodNotPassed(lastCharge, minPeriod, minPeriod - timeSinceLastCharge);
      }
    }

    IERC20 paymentToken = _getPaymentToken();
    paymentToken.safeTransferFrom(subscription.owner, address(this), amount);
    subscription.lastChargeTime = uint64(block.timestamp);
    emit UserCharged(subscription.owner, amount, subscriptionId);
  }

  /**
   * @dev User cancels their own subscription
   */
  function cancelSubscription(string calldata subscriptionId) external {
    Subscription storage subscription = subscriptions[subscriptionId];
    if (subscription.owner != _msgSender()) revert Forbidden(_msgSender());
    _cancelSubscription(subscription, subscriptionId);
  }

  /**
   * @dev Manager cancels user subscription
   */
  function cancelSubscriptionByManager(string calldata subscriptionId) external {
    bool isCallAllowed = Storage(info).getBool(keccak256(abi.encodePacked("EH:Billing:Manager:", _msgSender())));
    if (!isCallAllowed) revert Forbidden(_msgSender());
    _cancelSubscription(subscriptionId);
  }

  function _cancelSubscription(string calldata subscriptionId) internal {
    Subscription storage subscription = subscriptions[subscriptionId];
    if (subscription.owner == address(0)) revert SubscriptionNotFound(subscriptionId);
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

  function getTimeUntilNextCharge(string calldata subscriptionId) external view returns (uint256) {
    Subscription storage subscription = subscriptions[subscriptionId];
    uint64 lastCharge = subscription.lastChargeTime;
    if (lastCharge == 0) return 0;
    uint256 timeSinceLastCharge = block.timestamp - lastCharge;
    uint128 minPeriod = subscription.minPeriod;
    return timeSinceLastCharge >= minPeriod ? 0 : minPeriod - timeSinceLastCharge;
  }

  function getPaymentToken() external view returns (address) {
    return address(_getPaymentToken());
  }

  function getUserAllowance(address user) external view returns (uint256) {
    IERC20 paymentToken = _getPaymentToken();
    return paymentToken.allowance(user, address(this));
  }

  function getSubscriptionInfo(
    string calldata subscriptionId
  ) external view returns (address owner, uint128 maxAmount, uint128 minPeriod, uint64 lastChargeTime, bool active) {
    Subscription storage sub = subscriptions[subscriptionId];
    return (sub.owner, sub.maxAmount, sub.minPeriod, sub.lastChargeTime, sub.active);
  }

  function _cancelSubscription(Subscription storage subscription, string calldata subscriptionId) internal {
    if (!subscription.active) revert SubscriptionNotFound(subscriptionId);
    subscription.active = false;
    emit SubscriptionCancelled(subscriptionId);
  }

  function _setSubscriptionPlansInternal(SubscriptionPlanInput[] calldata plans) internal {
    uint256 length = plans.length;
    for (uint256 i; i < length; i++) {
      SubscriptionPlanInput calldata plan = plans[i];
      if (plan.amount == 0) revert InvalidAmount(plan.amount);
      if (plan.period == 0) revert InvalidPeriod(plan.period);
      subscriptionPlans[plan.planId] = SubscriptionPlan({amount: plan.amount, period: plan.period});
      emit SubscriptionPlanCreated(plan.planId, plan.amount, plan.period);
    }
  }

  function _getPaymentToken() internal view returns (IERC20) {
    address tokenAddress = Storage(info).getAddress(keccak256("EH:Billing:PaymentToken"));
    return IERC20(tokenAddress);
  }
}
