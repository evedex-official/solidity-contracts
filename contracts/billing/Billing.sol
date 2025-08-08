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
    uint64 lastChargeTime; // Last time user was charged
    bool active; // Whether subscription is active
    uint128 maxAmount; // Maximum amount per charge
    uint128 minPeriod; // Minimum time between charges (in seconds)
  }

  address public info;

  mapping(string => Subscription) public subscriptions;

  event UserCharged(address indexed user, uint256 amount, string indexed subscriptionId);
  event SubscriptionCreated(string indexed subscriptionId, address indexed user, uint256 maxAmount, uint256 minPeriod);
  event SubscriptionCancelled(string indexed subscriptionId);
  event FundsWithdrawn(address indexed to, uint256 amount);

  error Forbidden(address caller);
  error MaxAmountExceeded(address user, uint128 requested, uint128 available);
  error PeriodNotPassed(uint64 lastCharge, uint128 minInterval, uint256 timeRemaining);
  error SubscriptionNotFound(string subscriptionId);
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

  function initialize(address _info, address _owner) public initializer {
    __Ownable_init(_owner);
    __Pausable_init();
    __UUPSUpgradeable_init();

    if (_info == address(0)) revert InvalidAddress(_info);
    info = _info;
  }

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  /**
   * @dev User subscribes and provide allowed maxAmount and minPeriod for charging
   * @dev User get immediate charge after subscription creation
   */
  function subscribe(string calldata subscriptionId, uint128 amount, uint128 minPeriod) external whenNotPaused {
    if (amount == 0) revert InvalidAmount(amount);
    if (minPeriod == 0) revert InvalidPeriod(minPeriod);
    if (subscriptions[subscriptionId].owner != address(0)) revert SubscriptionAlreadyExists(subscriptionId);
    subscriptions[subscriptionId] = Subscription({
      owner: _msgSender(),
      lastChargeTime: 0,
      active: true,
      maxAmount: amount,
      minPeriod: minPeriod
    });
    _chargeUser(subscriptionId, amount);
    emit SubscriptionCreated(subscriptionId, _msgSender(), amount, minPeriod);
  }

  /**
   * @dev Manager charges user for subscription
   */
  function chargeUser(string calldata subscriptionId, uint128 amount) external whenNotPaused {
    bool isCallAllowed = Storage(info).getBool(keccak256(abi.encodePacked("EH:Billing:Manager:", _msgSender())));
    if (!isCallAllowed) revert Forbidden(_msgSender());
    if (amount == 0) revert InvalidAmount(amount);
    Subscription memory subscription = subscriptions[subscriptionId];
    if (subscription.owner == address(0)) revert SubscriptionNotFound(subscriptionId);
    if (!subscription.active) revert SubscriptionInactive(subscriptionId);
    _chargeUser(subscriptionId, amount);
  }

  /**
   * @dev User cancels their own subscription
   */
  function cancelSubscription(string calldata subscriptionId) external {
    if (subscriptions[subscriptionId].owner != _msgSender()) revert Forbidden(_msgSender());
    _cancelSubscription(subscriptionId);
  }

  /**
   * @dev Manager cancels user subscription
   */
  function cancelSubscriptionByManager(string calldata subscriptionId) external {
    bool isCallAllowed = Storage(info).getBool(keccak256(abi.encodePacked("EH:Billing:Manager:", _msgSender())));
    if (!isCallAllowed) revert Forbidden(_msgSender());
    _cancelSubscription(subscriptionId);
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
    Subscription memory subscription = subscriptions[subscriptionId];
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

  function _cancelSubscription(string calldata subscriptionId) internal {
    Subscription memory subscription = subscriptions[subscriptionId];
    if (subscription.owner == address(0) || !subscription.active) revert SubscriptionNotFound(subscriptionId);
    subscriptions[subscriptionId].active = false;
    emit SubscriptionCancelled(subscriptionId);
  }

  function _chargeUser(string calldata subscriptionId, uint128 amount) internal {
    Subscription memory subscription = subscriptions[subscriptionId];
    if (amount > subscription.maxAmount) {
      revert MaxAmountExceeded(subscription.owner, amount, subscription.maxAmount);
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
    subscriptions[subscriptionId].lastChargeTime = uint64(block.timestamp);
    paymentToken.safeTransferFrom(subscription.owner, address(this), amount);
    emit UserCharged(subscription.owner, amount, subscriptionId);
  }

  function _getPaymentToken() internal view returns (IERC20) {
    address tokenAddress = Storage(info).getAddress(keccak256("EH:Billing:PaymentToken"));
    return IERC20(tokenAddress);
  }
}
