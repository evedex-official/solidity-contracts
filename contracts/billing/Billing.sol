// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

interface IStorage {
  function getBool(bytes32 key) external view returns (bool);
}

contract Billing is Initializable, OwnableUpgradeable, PausableUpgradeable, UUPSUpgradeable {
  using SafeERC20 for IERC20;

  struct Subscription {
    string id;
    address owner;
    uint256 maxAmount; // Maximum amount per charge
    uint256 maxFrequency; // Minimum time between charges (in seconds)
    uint256 lastChargeTime; // Last time user was charged
    uint256 totalAllowance; // Total allowance granted by user
    uint256 usedAllowance; // Amount already used from allowance
    bool active; // Whether subscription is active
  }

  struct SubscriptionPlan {
    uint256 amount; // Cost per billing cycle
    uint256 frequency; // Billing frequency in seconds
    bool exists;
  }

  // State variables
  address public info;
  IERC20 public paymentToken;

  // Mappings
  mapping(string => Subscription) public subscriptions;
  mapping(string => SubscriptionPlan) public subscriptionPlans;
  mapping(address => mapping(string => uint256)) public userAllowances; // user => subscriptionId => allowance
  mapping(address => uint256) public userTotalEscrowed; // Total escrowed per user

  // Events
  event UserCharged(address indexed user, uint256 amount, string indexed subscriptionId);
  event SubscriptionCreated(
    string indexed subscriptionId,
    address indexed user,
    uint256 maxAmount,
    uint256 maxFrequency
  );
  event SubscriptionCancelled(string indexed subscriptionId);
  event AllowanceSet(address indexed user, string indexed subscriptionId, uint256 allowance);
  event PaymentTokenUpdated(address indexed newPaymentToken);
  event SubscriptionPlanCreated(string indexed planId, uint256 amount, uint256 frequency);
  event FundsWithdrawn(address indexed to, uint256 amount);

  // Custom errors
  error Forbidden();
  error Unauthorized();
  error AllowanceNotEnough(address user, uint256 requested, uint256 available);
  error FrequencyLimitExceeded(uint256 lastCharge, uint256 minInterval);
  error SubscriptionNotFound(string subscriptionId);
  error SubscriptionAlreadyExists(string subscriptionId);
  error InvalidAmount();
  error InvalidFrequency();
  error InsufficientTokenBalance(address user, uint256 required, uint256 available);
  error SubscriptionInactive(string subscriptionId);

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  // todo(shcube): move paymenToken to storage contract
  function initialize(address _info, address _paymentToken, address _owner) public initializer {
    __Ownable_init(_owner);
    __Pausable_init();
    __UUPSUpgradeable_init();

    info = _info;
    paymentToken = IERC20(_paymentToken);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  /**
   * @dev Creates a subscription plan that users can subscribe to
   */
  function createSubscriptionPlan(string calldata planId, uint256 amount, uint256 frequency) external onlyOwner {
    if (amount == 0) revert InvalidAmount();
    if (frequency == 0) revert InvalidFrequency();

    subscriptionPlans[planId] = SubscriptionPlan({amount: amount, frequency: frequency, exists: true});

    emit SubscriptionPlanCreated(planId, amount, frequency);
  }

  /**
   * @dev User subscribes to a plan with specific allowance and limits
   */
  function subscribe(
    string calldata subscriptionId,
    string calldata planId,
    uint256 totalAllowance
  ) external whenNotPaused {
    if (subscriptions[subscriptionId].active) {
      revert SubscriptionAlreadyExists(subscriptionId);
    }

    SubscriptionPlan memory plan = subscriptionPlans[planId];
    if (!plan.exists) revert SubscriptionNotFound(planId);

    // Check user has enough token balance for the allowance
    uint256 userBalance = paymentToken.balanceOf(_msgSender());
    if (userBalance < totalAllowance) {
      revert InsufficientTokenBalance(_msgSender(), totalAllowance, userBalance);
    }

    subscriptions[subscriptionId] = Subscription({
      id: subscriptionId,
      owner: _msgSender(),
      maxAmount: plan.amount,
      maxFrequency: plan.frequency,
      lastChargeTime: 0,
      totalAllowance: totalAllowance,
      usedAllowance: 0,
      active: true
    });

    userAllowances[_msgSender()][subscriptionId] = totalAllowance;
    userTotalEscrowed[_msgSender()] += totalAllowance;

    emit SubscriptionCreated(subscriptionId, _msgSender(), plan.amount, plan.frequency);
    emit AllowanceSet(_msgSender(), subscriptionId, totalAllowance);
  }

  /**
   * @dev Manager charges user for subscription
   */
  function chargeUser(string calldata subscriptionId, uint256 amount) external whenNotPaused {
    // Check if caller is authorized manager
    bool isCallAllowed = IStorage(info).getBool(keccak256(abi.encodePacked("EH:Billing:Manager:", _msgSender())));
    if (!isCallAllowed) revert Forbidden();

    Subscription storage subscription = subscriptions[subscriptionId];
    if (!subscription.active) revert SubscriptionInactive(subscriptionId);

    // Check amount doesn't exceed max allowed
    if (amount > subscription.maxAmount) {
      revert AllowanceNotEnough(subscription.owner, amount, subscription.maxAmount);
    }

    // Check frequency limit
    if (subscription.lastChargeTime != 0) {
      uint256 timeSinceLastCharge = block.timestamp - subscription.lastChargeTime;
      if (timeSinceLastCharge < subscription.maxFrequency) {
        revert FrequencyLimitExceeded(subscription.lastChargeTime, subscription.maxFrequency);
      }
    }

    // Check allowance
    uint256 remainingAllowance = subscription.totalAllowance - subscription.usedAllowance;
    if (amount > remainingAllowance) {
      revert AllowanceNotEnough(subscription.owner, amount, remainingAllowance);
    }

    // Check user's token balance
    uint256 userBalance = paymentToken.balanceOf(subscription.owner);
    if (userBalance < amount) {
      revert InsufficientTokenBalance(subscription.owner, amount, userBalance);
    }

    // Perform the transfer
    paymentToken.safeTransferFrom(subscription.owner, address(this), amount);

    // Update subscription state
    subscription.usedAllowance += amount;
    subscription.lastChargeTime = block.timestamp;

    emit UserCharged(subscription.owner, amount, subscriptionId);
  }

  /**
   * @dev User cancels their own subscription
   */
  function cancelSubscription(string calldata subscriptionId) external {
    Subscription storage subscription = subscriptions[subscriptionId];
    if (subscription.owner != _msgSender()) {
      revert Unauthorized();
    }

    _cancelSubscription(subscriptionId);
  }

  /**
   * @dev Manager cancels user subscription
   */
  function cancelSubscriptionByManager(string calldata subscriptionId) external {
    bool isCallAllowed = IStorage(info).getBool(keccak256(abi.encodePacked("EH:Billing:Manager:", _msgSender())));
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
    userTotalEscrowed[subscription.owner] -= (subscription.totalAllowance - subscription.usedAllowance);
    userAllowances[subscription.owner][subscriptionId] = 0;

    emit SubscriptionCancelled(subscriptionId);
  }

  /**
   * @dev User can increase their allowance for a subscription
   */
  function increaseAllowance(string calldata subscriptionId, uint256 additionalAllowance) external whenNotPaused {
    Subscription storage subscription = subscriptions[subscriptionId];
    if (subscription.owner != _msgSender()) revert Unauthorized();
    if (!subscription.active) revert SubscriptionInactive(subscriptionId);

    uint256 userBalance = paymentToken.balanceOf(_msgSender());
    if (userBalance < additionalAllowance) {
      revert InsufficientTokenBalance(_msgSender(), additionalAllowance, userBalance);
    }

    subscription.totalAllowance += additionalAllowance;
    userAllowances[_msgSender()][subscriptionId] += additionalAllowance;
    userTotalEscrowed[_msgSender()] += additionalAllowance;

    emit AllowanceSet(_msgSender(), subscriptionId, subscription.totalAllowance);
  }

  /**
   * @dev Owner withdraws collected funds
   */
  function withdrawFunds(address to, uint256 amount) external onlyOwner {
    if (amount > paymentToken.balanceOf(address(this))) {
      revert InsufficientTokenBalance(address(this), amount, paymentToken.balanceOf(address(this)));
    }

    paymentToken.safeTransfer(to, amount);
    emit FundsWithdrawn(to, amount);
  }

  /**
   * @dev Owner sets new payment token
   */
  function setPaymentToken(address newPaymentToken) external onlyOwner {
    paymentToken = IERC20(newPaymentToken);
    emit PaymentTokenUpdated(newPaymentToken);
  }

  /**
   * @dev Pause the contract
   */
  function pause() external onlyOwner {
    _pause();
  }

  /**
   * @dev Unpause the contract
   */
  function unpause() external onlyOwner {
    _unpause();
  }

  // View functions
  function getSubscription(string calldata subscriptionId) external view returns (Subscription memory) {
    return subscriptions[subscriptionId];
  }

  function getRemainingAllowance(string calldata subscriptionId) external view returns (uint256) {
    Subscription memory subscription = subscriptions[subscriptionId];
    return subscription.totalAllowance - subscription.usedAllowance;
  }

  function getTimeUntilNextCharge(string calldata subscriptionId) external view returns (uint256) {
    Subscription memory subscription = subscriptions[subscriptionId];
    if (subscription.lastChargeTime == 0) return 0;

    uint256 timeSinceLastCharge = block.timestamp - subscription.lastChargeTime;
    if (timeSinceLastCharge >= subscription.maxFrequency) return 0;

    return subscription.maxFrequency - timeSinceLastCharge;
  }
}
