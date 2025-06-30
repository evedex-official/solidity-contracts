// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Permit2Mock {
  // Mapping: owner => token => spender => allowance details
  mapping(address => mapping(address => mapping(address => AllowanceData))) public allowance;

  struct AllowanceData {
    uint160 amount;
    uint48 expiration;
    uint48 nonce;
  }

  event Approval(
    address indexed owner,
    address indexed token,
    address indexed spender,
    uint160 amount,
    uint48 expiration
  );

  function approve(address token, address spender, uint160 amount, uint48 expiration) external {
    allowance[msg.sender][token][spender] = AllowanceData({amount: amount, expiration: expiration, nonce: 0});
    emit Approval(msg.sender, token, spender, amount, expiration);
  }

  // Helper function to check allowance (for testing)
  function getAllowance(
    address owner,
    address token,
    address spender
  ) external view returns (uint160 amount, uint48 expiration, uint48 nonce) {
    AllowanceData memory data = allowance[owner][token][spender];
    return (data.amount, data.expiration, data.nonce);
  }
}
