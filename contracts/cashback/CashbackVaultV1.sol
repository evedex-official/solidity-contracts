// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

contract CashbackVaultV1 is OwnableUpgradeable, PausableUpgradeable {
  using SafeERC20 for IERC20;
  using MessageHashUtils for bytes32;
  using ECDSA for bytes32;

  /// @dev Address of signer payload for withdraw method.
  address public signer;

  /// @notice Target token.
  address public token;

  mapping(uint80 => bool) public request;

  /// @dev Storage gap for future upgrades.
  uint256[10] internal __gap;

  /// @notice Emited if tokens have been withdrawal.
  event CashbackWithdraw(address indexed recipient, uint80 requestId, uint256 amount);

  /// @notice Emited if tokens have been withdrawal without request.
  event CashbackWithdrawCrumbs(address indexed recipient, uint256 amount);

  error CashbackVaultV1WithdrawAlreadyCompleted();
  error CashbackVaultV1InvalidWithdrawSignature();

  constructor() {
    _disableInitializers();
  }

  function initialize(address _token, address _signer) public initializer {
    __Ownable_init(_msgSender());
    __Pausable_init();
    token = _token;
    signer = _signer;
  }

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  /// @notice Withdraw tokens.
  /// @param recipient Tokens recipient address.
  /// @param requestId Withdraw request ID.
  /// @param amount Withdrawal token amount.
  function withdraw(
    address recipient,
    uint80 requestId,
    uint256 amount,
    bytes memory signature
  ) external whenNotPaused {
    bytes32 signedMessage = keccak256(abi.encodePacked(requestId, recipient, amount));
    if (signedMessage.toEthSignedMessageHash().recover(signature) != signer) {
      revert CashbackVaultV1InvalidWithdrawSignature();
    }
    if (request[requestId]) {
      revert CashbackVaultV1WithdrawAlreadyCompleted();
    }

    request[requestId] = true;
    IERC20(token).safeTransfer(recipient, amount);
    emit CashbackWithdraw(recipient, requestId, amount);
  }

  /// @notice Withdraw tokens without request.
  /// @param recipient Tokens recipient address.
  /// @param amount Withdrawal token amount.
  function withdrawCrumbs(address recipient, uint256 amount) external onlyOwner {
    IERC20(token).safeTransfer(recipient, amount);
    emit CashbackWithdrawCrumbs(recipient, amount);
  }
}
