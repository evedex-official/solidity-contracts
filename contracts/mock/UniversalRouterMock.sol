// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract UniversalRouterMock {
  address public resultToken;
  uint256 public resultAmount;
  bool public shouldFail = false;

  receive() external payable {}

  function setSwapResult(address token, uint256 amount) external {
    resultToken = token;
    resultAmount = amount;
  }

  function setShouldFail(bool _shouldFail) external {
    shouldFail = _shouldFail;
  }

  function execute(bytes calldata, bytes[] calldata, uint256) external payable {
    require(!shouldFail, "Mock router failure");
    if (resultToken == address(0)) {
      payable(msg.sender).transfer(resultAmount);
    } else {
      IERC20(resultToken).transfer(msg.sender, resultAmount);
    }
  }
}
