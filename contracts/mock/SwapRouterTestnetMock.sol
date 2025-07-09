//  SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "./TestnetWETH.sol";

/**
 * @title SwapRouterTestnetMock
 * @notice Uniswap V3 SwapRouter mock for testnet
 * @dev This mock returns 1:1 token amounts for all swaps
 *      - Accepts native ETH and wraps to WETH internally
 *      - Returns WETH for ETH output (no unwrapping)
 *      - All swaps have 1:1 input to output ratio
 */
contract SwapRouterTestnetMock is ISwapRouter {
  address payable public immutable WETH;

  constructor(address payable _weth) {
    WETH = _weth;
  }

  receive() external payable {}

  function exactInputSingle(
    ExactInputSingleParams calldata params
  ) external payable override returns (uint256 amountOut) {
    address tokenIn = params.tokenIn;
    address tokenOut = params.tokenOut;
    uint256 amountIn = params.amountIn;
    address recipient = params.recipient;

    // Handle native ETH input - V3 accepts ETH and wraps to WETH internally
    if (msg.value > 0) {
      require(tokenIn == WETH, "Invalid tokenIn for ETH swap");
      require(msg.value >= amountIn, "Insufficient ETH sent");

      // Wrap ETH to WETH first (simulating V3 behavior)
      TestnetWETH(WETH).deposit{value: amountIn}();

      // Now swap WETH to tokenOut (1:1 ratio)
      _transferTokens(tokenOut, recipient, amountIn);

      // Return excess ETH if any
      if (msg.value > amountIn) {
        payable(msg.sender).transfer(msg.value - amountIn);
      }

      return amountIn;
    }

    // Handle token to token/WETH swap
    IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

    // For ETH output, V3 returns WETH (no unwrapping)
    _transferTokens(tokenOut, recipient, amountIn);

    return amountIn; // 1:1 ratio
  }

  function exactInput(ExactInputParams calldata params) external payable override returns (uint256 amountOut) {
    // For simplicity, just handle as single swap
    revert("Use exactInputSingle for testnet");
  }

  function exactOutputSingle(ExactOutputSingleParams calldata) external payable override returns (uint256 amountIn) {
    revert("Not implemented for testnet");
  }

  function exactOutput(ExactOutputParams calldata) external payable override returns (uint256 amountIn) {
    revert("Not implemented for testnet");
  }

  function uniswapV3SwapCallback(int256, int256, bytes calldata) external pure override {
    revert("Not implemented for testnet");
  }

  function _transferTokens(address token, address to, uint256 amount) internal {
    // Try to transfer existing balance first
    uint256 balance = IERC20(token).balanceOf(address(this));
    if (balance >= amount) {
      IERC20(token).transfer(to, amount);
    } else {
      // If not enough balance, try to mint (if it's a mock token)
      try this._tryMint(token, to, amount) {
        // Mint successful
      } catch {
        // If minting fails, revert
        revert("Insufficient token balance and minting failed");
      }
    }
  }

  function _tryMint(address token, address to, uint256 amount) external {
    require(msg.sender == address(this), "Only self can call");
    // Try to call mint function (works with TestnetERC20)
    (bool success, ) = token.call(abi.encodeWithSignature("mint(address,uint256)", to, amount));
    require(success, "Mint failed");
  }

  // Emergency functions for testnet
  function withdrawToken(address token, uint256 amount) external {
    IERC20(token).transfer(msg.sender, amount);
  }

  function withdrawETH(uint256 amount) external {
    payable(msg.sender).transfer(amount);
  }
}
