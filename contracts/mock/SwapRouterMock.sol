// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

contract SwapRouterMock is ISwapRouter {
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

  function exactInputSingle(ExactInputSingleParams calldata) external payable override returns (uint256 amountOut) {
    require(!shouldFail, "Mock router failure");

    if (resultToken == address(0)) {
      payable(msg.sender).transfer(resultAmount);
    } else {
      IERC20(resultToken).transfer(msg.sender, resultAmount);
    }

    return resultAmount;
  }

  function exactInput(ExactInputParams calldata) external payable override returns (uint256 amountOut) {
    require(!shouldFail, "Mock router failure");

    if (resultToken == address(0)) {
      payable(msg.sender).transfer(resultAmount);
    } else {
      IERC20(resultToken).transfer(msg.sender, resultAmount);
    }

    return resultAmount;
  }

  function exactOutputSingle(ExactOutputSingleParams calldata) external payable override returns (uint256 amountIn) {
    require(!shouldFail, "Mock router failure");
    revert("Not implemented");
  }

  function exactOutput(ExactOutputParams calldata) external payable override returns (uint256 amountIn) {
    require(!shouldFail, "Mock router failure");
    revert("Not implemented");
  }

  function uniswapV3SwapCallback(int256, int256, bytes calldata) external pure override {
    revert("Not implemented");
  }
}
