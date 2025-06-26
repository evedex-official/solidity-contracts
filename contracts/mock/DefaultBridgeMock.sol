// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockDefaultBridge {
  function getGateway(address) external view returns (address) {
    return address(this);
  }

  function deposit(address token, uint256 amount) external payable {
    // Mock deposit function
  }
}
