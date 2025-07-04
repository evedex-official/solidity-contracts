// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.24;

interface IDepositManager {
  function executeDeposit(
    bytes32 depositType,
    address token,
    uint256 amount,
    bytes calldata data
  ) external payable returns (bool success);
}
