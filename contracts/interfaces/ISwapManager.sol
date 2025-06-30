// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.24;

interface ISwapManager {
  struct SwapResult {
    address tokenOut;
    uint256 amountOut;
  }

  function executeSwap(
    bytes32 swapType,
    address tokenIn,
    uint256 amountIn,
    uint256 minAmountOut,
    bytes calldata swapData
  ) external payable returns (SwapResult memory);
}
