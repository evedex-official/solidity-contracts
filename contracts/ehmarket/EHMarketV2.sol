// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";

contract EHMarketV2 is AccessControlEnumerableUpgradeable {
  using SafeERC20 for IERC20;

  /// @dev Struct to hold withdraw limits for selected amount of last hours
  struct WithdrawLimit {
    /// @dev Total limit for the timeWindow
    uint256 limit;
    /// @dev Limit per user for the timeWindow
    uint256 userLimit;
    /// @notice Time window in hours
    uint16 timeWindow;
  }

  error UnauthorizedSigner();
  error TotalLimitExceeded(uint256 currentTotal, uint256 requestedAmount, uint256 configIndex);
  error UserLimitExceeded(uint256 currentTotal, uint256 requestedAmount, uint256 configIndex);
  error InvalidWithdrawLimit(uint256 limit, uint256 userLimit, uint16 timeWindow);
  error InvalidWithdrawLimitLength();

  event UserBalanceChanged(address indexed account, int256 amount, uint256 requestId);
  event DelegateUpdated(address indexed delegator, address indexed delegate, uint256 allowance);
  event WithdrawLimitsUpdated(WithdrawLimit[] withdrawLimits);

  bytes32 public constant MATCHER_ROLE = keccak256("MATCHER_ROLE");
  address public collateral;

  uint256 public constant MAX_LIMIT_CONFIGS = 20;

  mapping(uint256 => uint256) public hourlyWithdrawals;
  mapping(uint256 => mapping(address => uint256)) public userHourlyWithdrawals;
  WithdrawLimit[] public withdrawLimits;

  /// @dev Storage gap for future upgrades.
  uint256[10] internal __gap;

  constructor() {
    _disableInitializers();
  }

  function initialize(
    address[] memory _matchers,
    address _collateral,
    WithdrawLimit[] memory _initialWithdrawLimits
  ) public initializer {
    __AccessControlEnumerable_init();

    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
    for (uint i = 0; i < _matchers.length; i++) {
      _grantRole(MATCHER_ROLE, _matchers[i]);
    }
    collateral = _collateral;
    _setWithdrawLimits(_initialWithdrawLimits);
  }

  //////////////////////////
  //  User functions
  //////////////////////////

  function depositAssetTo(address to, uint256 amount) public {
    emit UserBalanceChanged(to, int256(amount), 0);
    IERC20(collateral).safeTransferFrom(_msgSender(), address(this), amount);
  }

  function depositAsset(uint256 amount) external {
    depositAssetTo(_msgSender(), amount);
  }

  function withdrawAsset(address from, uint256 amount, uint256 requestId) external {
    bool isMatcher = hasRole(MATCHER_ROLE, _msgSender());
    bool isAdmin = hasRole(DEFAULT_ADMIN_ROLE, _msgSender());
    require(isMatcher || isAdmin, UnauthorizedSigner());
    if (isMatcher && !isAdmin) {
      _checkWithdrawLimits(amount, from);
      uint256 currentHour = _getHour(block.timestamp);
      hourlyWithdrawals[currentHour] += amount;
      userHourlyWithdrawals[currentHour][from] += amount;
    }
    emit UserBalanceChanged(from, -int256(amount), requestId);
    IERC20(collateral).safeTransfer(from, amount);
  }

  function setDelegate(address delegate, uint256 allowance) external {
    emit DelegateUpdated(_msgSender(), delegate, allowance);
  }

  /**
   * @notice Replaces all withdrawal limits with a new set
   * @notice _withdrawLimits should be sorted in ascending order
   */
  function setWithdrawLimits(WithdrawLimit[] memory _withdrawLimits) public onlyRole(DEFAULT_ADMIN_ROLE) {
    _setWithdrawLimits(_withdrawLimits);
  }

  /**
   * @notice Calculates total of withdrawals for a given time window
   * @dev Sums up hourly withdrawals from the specified timestamp looking back by the specified hours
   * @param _hours Number of hours to look back
   * @param timestamp The timestamp to start calculations from
   * @return Total of withdrawals during the specified period
   */
  function getTotalWithdraw(uint16 _hours, uint256 timestamp) public view returns (uint256) {
    uint256 total = 0;
    uint256 startHour = _getHour(timestamp);
    for (uint256 i = 0; i < _hours; i++) {
      total += hourlyWithdrawals[startHour - i * 1 hours];
    }
    return total;
  }

  /**
   * @notice Calculates a user's total withdrawals for a given time window
   * @dev Sums up user's hourly withdrawals from the specified timestamp looking back by the specified hours
   * @param _hours Number of hours to look back
   * @param timestamp The timestamp to start calculations from
   * @param user The user address to check
   * @return User's total withdrawals during the specified period
   */
  function getUserTotalWithdraw(uint16 _hours, uint256 timestamp, address user) public view returns (uint256) {
    uint256 total = 0;
    uint256 startHour = _getHour(timestamp);
    for (uint256 i = 0; i < _hours; i++) {
      total += userHourlyWithdrawals[startHour - i * 1 hours][user];
    }
    return total;
  }

  /**
   * @notice Calculates maximum amount user can withdraw without exceeding any limits
   * @dev Checks all withdrawal limits and returns the most restrictive one
   * @param user Address of the user
   * @return maxAmount Maximum amount the user can withdraw
   * @return limitingIndex Index of the withdraw limit that is currently the most restrictive
   * @return isUserLimit Boolean indicating whether the restriction is from a user limit (true) or global limit (false)
   */
  function getMaxWithdrawAmount(
    address user
  ) public view returns (uint256 maxAmount, uint256 limitingIndex, bool isUserLimit) {
    maxAmount = type(uint256).max;
    limitingIndex = type(uint256).max;
    isUserLimit = false;
    uint256 withdrawLimitsLength = withdrawLimits.length;
    if (withdrawLimitsLength == 0) {
      return (maxAmount, limitingIndex, isUserLimit);
    }
    uint256 baseTimestamp = block.timestamp;
    uint256 globalTotal;
    uint256 userTotal;
    uint16 lastTimeWindow;
    for (uint256 i = 0; i < withdrawLimitsLength; i++) {
      WithdrawLimit memory limit = withdrawLimits[i];
      uint256 timestamp = baseTimestamp - 1 hours * uint256(lastTimeWindow);
      uint16 timeWindow = limit.timeWindow - lastTimeWindow;
      globalTotal += getTotalWithdraw(timeWindow, timestamp);
      userTotal += getUserTotalWithdraw(timeWindow, timestamp, user);
      lastTimeWindow = limit.timeWindow;
      if (globalTotal >= limit.limit) {
        return (0, i, false);
      }
      if (userTotal >= limit.userLimit) {
        return (0, i, true);
      }
      // Calculate remaining capacity
      uint256 globalRemaining = limit.limit - globalTotal;
      uint256 userRemaining = limit.userLimit - userTotal;
      // Determine which is more restrictive
      if (userRemaining < globalRemaining) {
        if (userRemaining < maxAmount) {
          maxAmount = userRemaining;
          limitingIndex = i;
          isUserLimit = true;
        }
      } else {
        if (globalRemaining < maxAmount) {
          maxAmount = globalRemaining;
          limitingIndex = i;
          isUserLimit = false;
        }
      }
    }

    return (maxAmount, limitingIndex, isUserLimit);
  }

  function _getHour(uint256 timestamp) internal pure returns (uint256) {
    return timestamp - (timestamp % 1 hours);
  }

  /**
   * @notice Verifies that a withdrawal does not exceed configured limits
   * @dev Checks both global and per-user limits for all configured time windows
   * @param amount Amount to withdraw
   * @param user User address attempting to withdraw
   */
  function _checkWithdrawLimits(uint256 amount, address user) internal view {
    uint256 withdrawLimitsLength = withdrawLimits.length;
    if (withdrawLimitsLength == 0) return;
    uint256 baseTimestamp = block.timestamp;
    uint256 globalTotal;
    uint256 userTotal;
    uint16 lastTimeWindow;
    for (uint256 i = 0; i < withdrawLimitsLength; i++) {
      WithdrawLimit memory limit = withdrawLimits[i];
      uint256 timestamp = baseTimestamp - 1 hours * uint256(lastTimeWindow);
      uint16 timeWindow = limit.timeWindow - lastTimeWindow;
      globalTotal += getTotalWithdraw(timeWindow, timestamp);
      userTotal += getUserTotalWithdraw(timeWindow, timestamp, user);
      lastTimeWindow = limit.timeWindow;
      if (globalTotal + amount > limit.limit) {
        revert TotalLimitExceeded(globalTotal, amount, i);
      }
      if (userTotal + amount > limit.userLimit) {
        revert UserLimitExceeded(userTotal, amount, i);
      }
    }
  }

  /**
   * @dev Internal implementation of setWithdrawLimits.
   * See {setWithdrawLimits} for details.
   */
  function _setWithdrawLimits(WithdrawLimit[] memory _withdrawLimits) private {
    if (_withdrawLimits.length > MAX_LIMIT_CONFIGS) {
      revert InvalidWithdrawLimitLength();
    }
    delete withdrawLimits;
    if (_withdrawLimits.length == 0) {
      emit WithdrawLimitsUpdated(withdrawLimits);
      return;
    }
    WithdrawLimit memory firstLimit = _withdrawLimits[0];
    if (
      firstLimit.limit == 0 ||
      firstLimit.userLimit == 0 ||
      firstLimit.timeWindow == 0 ||
      firstLimit.limit < firstLimit.userLimit
    ) {
      revert InvalidWithdrawLimit(firstLimit.limit, firstLimit.userLimit, firstLimit.timeWindow);
    }
    for (uint256 i = 1; i < _withdrawLimits.length; i++) {
      WithdrawLimit memory newLimit = _withdrawLimits[i];
      if (
        newLimit.limit <= _withdrawLimits[i - 1].limit ||
        newLimit.userLimit <= _withdrawLimits[i - 1].userLimit ||
        newLimit.timeWindow <= _withdrawLimits[i - 1].timeWindow ||
        newLimit.limit < newLimit.userLimit
      ) {
        revert InvalidWithdrawLimit(newLimit.limit, newLimit.userLimit, newLimit.timeWindow);
      }
    }
    withdrawLimits = _withdrawLimits;
    emit WithdrawLimitsUpdated(withdrawLimits);
  }
}
