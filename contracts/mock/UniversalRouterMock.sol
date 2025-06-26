// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockV4Router {
  address public resultToken;
  uint256 public resultAmount;
  bool public shouldFail = false;

  function setSwapResult(address token, uint256 amount) external {
    resultToken = token;
    resultAmount = amount;
  }

  function setShouldFail(bool _shouldFail) external {
    shouldFail = _shouldFail;
  }

  function execute(bytes calldata, bytes[] calldata, uint256) external {
    require(!shouldFail, "Mock router failure");
    if (resultToken != address(0) && resultAmount > 0) {
      IERC20(resultToken).transfer(msg.sender, resultAmount);
    }
  }
}
