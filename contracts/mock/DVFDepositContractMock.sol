// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20Permit {
  function permit(
    address owner,
    address spender,
    uint256 value,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) external;
}

contract DVFDepositContractMock is Ownable {
  using SafeERC20 for IERC20;

  struct Deposit {
    address sender;
    address origin;
    address token;
    uint256 amount;
    uint256 commitmentId;
  }

  // Track deposits for testing verification
  Deposit[] public deposits;

  // Track native token deposits
  uint256 public nativeTokenDepositAmount;

  // Track if deposits are allowed (for testing error cases)
  bool public depositsDisallowed;

  struct PermitCall {
    address token;
    address owner;
    address spender;
    uint256 amount;
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
  }
  PermitCall[] public permitCalls;

  event BridgedDepositWithId(address sender, address origin, address token, uint256 amount, uint256 commitmentId);

  constructor() Ownable(_msgSender()) {}

  // Implement actual depositWithId for direct testing
  function depositWithId(address token, uint256 amount, uint256 commitmentId) public {
    require(token != address(0), "BLACKHOLE_NOT_ALLOWED");
    IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    emit BridgedDepositWithId(msg.sender, tx.origin, token, amount, commitmentId);
    // // Store deposit for testing verification
    deposits.push(
      Deposit({sender: msg.sender, origin: tx.origin, token: token, amount: amount, commitmentId: commitmentId})
    );
  }

  // Implement depositNativeWithId for native token deposits
  function depositNativeWithId(uint256 commitmentId) external payable {
    nativeTokenDepositAmount += msg.value;
    emit BridgedDepositWithId(msg.sender, tx.origin, address(0), msg.value, commitmentId);

    // Store deposit for testing verification
    deposits.push(
      Deposit({sender: msg.sender, origin: tx.origin, token: address(0), amount: msg.value, commitmentId: commitmentId})
    );
  }

  function depositWithPermit(
    address token,
    uint256 amount,
    uint256 deadline,
    uint8 v,
    bytes32 r,
    bytes32 s,
    uint256 commitmentId
  ) external {
    // Store permit call for testing verification
    permitCalls.push(
      PermitCall({
        token: token,
        owner: msg.sender,
        spender: address(this),
        amount: amount,
        deadline: deadline,
        v: v,
        r: r,
        s: s
      })
    );

    // Call permit on token
    IERC20Permit(token).permit(msg.sender, address(this), amount, deadline, v, r, s);

    // Then proceed with normal deposit
    depositWithId(token, amount, commitmentId);
  }

  // Function to enable/disable deposits for testing error cases
  function setDepositsDisallowed(bool _depositsDisallowed) external onlyOwner {
    depositsDisallowed = _depositsDisallowed;
  }

  // Get total number of deposits for testing
  function getDepositCount() external view returns (uint256) {
    return deposits.length;
  }

  // Get deposit by index for testing
  function getDeposit(
    uint256 index
  ) external view returns (address sender, address origin, address token, uint256 amount, uint256 commitmentId) {
    require(index < deposits.length, "Index out of bounds");
    Deposit memory deposit = deposits[index];
    return (deposit.sender, deposit.origin, deposit.token, deposit.amount, deposit.commitmentId);
  }

  // Allow contract to receive ETH
  receive() external payable {}
}
