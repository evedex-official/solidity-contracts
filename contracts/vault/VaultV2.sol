// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Storage} from "../storage/Storage.sol";

contract VaultV2 is OwnableUpgradeable, PausableUpgradeable {
  using SafeERC20 for IERC20;

  /// @dev Storage contract address.
  address public info;

  /// @dev Disributed balances.
  mapping(address => mapping(address => uint256)) internal _balances;

  /// @dev Total number of distributed tokens.
  mapping(address => uint256) internal _totalDistributed;

  /// @notice Emited if tokens distributed for account.
  event Distribute(address indexed account, address indexed token, uint256 amount);

  /// @notice Emited if distributed tokens have been revoked.
  event Reset(address indexed account, address indexed token);

  /// @notice Emited if distributed tokens have been withdrawal.
  event Withdrawal(address indexed from, address indexed recipient, address indexed token, uint256 amount);

  error VaultWithdrawFailed(address recipient, address token, uint256 amount);
  error VaultDistributeOverflow(address token, uint256 balance, uint256 totalDistributed, uint256 amount);
  error Forbidden();

  /// @dev Storage gap for future upgrades.
  uint256[10] internal __gap;

  constructor() {
    _disableInitializers();
  }

  function initialize(address _info) public initializer {
    __Ownable_init(_msgSender());
    __Pausable_init();
    info = _info;
  }

  receive() external payable {}

  fallback() external payable {}

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  /// @notice Distribute tokens for account.
  /// @param token Target token address (zero address for native token).
  /// @param account Target account.
  /// @param amount Number of tokens distributed.
  function distribute(address token, address account, uint256 amount) external payable {
    bool isCallAllowed = Storage(info).getBool(
      keccak256(abi.encodePacked("EH:PartnerVault:Distributor:", _msgSender()))
    );
    if (!isCallAllowed) revert Forbidden();

    uint256 balance = 0;
    if (token == address(0)) {
      balance = address(this).balance;
    } else {
      balance = IERC20(token).balanceOf(address(this));
    }
    uint256 __totalDistributed = _totalDistributed[token];
    if (balance < __totalDistributed + amount) {
      revert VaultDistributeOverflow(token, balance, __totalDistributed, amount);
    }

    _balances[account][token] += amount;
    _totalDistributed[token] += amount;

    emit Distribute(account, token, amount);
  }

  /// @param token Target token address (zero address for native token).
  /// @return Total number of distributed tokens.
  function totalDistributed(address token) public view returns (uint256) {
    return _totalDistributed[token];
  }

  /// @param token Target token address (zero address for native token).
  /// @param account Target account.
  /// @return Balance distributed tokens of account.
  function balanceOf(address token, address account) public view returns (uint256) {
    return _balances[account][token];
  }

  /// @dev Withdraw distributed tokens.
  /// @param token Target token address (zero address for native token).
  /// @param from Tokens owner address.
  /// @param recipient Tokens recipient address.
  function _withdraw(address token, address from, address recipient) internal {
    uint256 amount = balanceOf(token, from);
    _balances[from][token] = 0;
    _totalDistributed[token] -= amount;

    if (token == address(0)) {
      (bool sent, ) = recipient.call{value: amount}("");
      if (!sent) revert VaultWithdrawFailed(recipient, token, amount);
    } else {
      IERC20(token).safeTransfer(recipient, amount);
    }

    emit Withdrawal(from, recipient, token, amount);
  }

  /// @notice Withdraw distributed tokens of transaction sender.
  /// @param token Target token address (zero address for native token).
  function withdraw(address token) external whenNotPaused {
    address recipient = _msgSender();
    _withdraw(token, recipient, recipient);
  }

  /// @notice Withdraw distributed tokens.
  /// @param token Target token address (zero address for native token).
  /// @param from Tokens owner address.
  /// @param recipient Tokens recipient address.
  function withdrawFrom(address token, address from, address recipient) external whenPaused onlyOwner {
    _withdraw(token, from, recipient);
  }

  /// @notice Revoke distributed tokens.
  /// @param token Target token address (zero address for native token).
  /// @param account Targer account address.
  function reset(address token, address account) external whenPaused onlyOwner {
    _totalDistributed[token] -= _balances[account][token];
    _balances[account][token] = 0;

    emit Reset(account, token);
  }

  /// @notice Withdraw not distributed tokens.
  /// @param recipient Tokens recipient address.
  function withdrawCrumbs(address token, address recipient) external onlyOwner {
    uint256 amount = 0;
    if (token == address(0)) {
      amount = address(this).balance - _totalDistributed[token];
      (bool sent, ) = recipient.call{value: amount}("");
      if (!sent) revert VaultWithdrawFailed(recipient, token, amount);
    } else {
      amount = IERC20(token).balanceOf(address(this)) - _totalDistributed[token];
      IERC20(token).safeTransfer(recipient, amount);
    }

    emit Withdrawal(address(this), recipient, token, amount);
  }
}
