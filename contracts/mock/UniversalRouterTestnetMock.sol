// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Commands} from "@uniswap/universal-router/contracts/libraries/Commands.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

/**
 * @title UniversalRouterTestnetMock
 * @notice Uniswap V4 Universal Router mock for testnet
 * @dev This mock returns 1:1 token amounts for all swaps
 *      - Parses the exact same data format as used by SwapManager
 *      - Supports both ETH and ERC20 token swaps
 *      - All swaps have 1:1 input to output ratio
 */
contract UniversalRouterTestnetMock {
  receive() external payable {}

  function execute(bytes calldata commands, bytes[] calldata inputs, uint256 /* deadline */) external payable {
    // Parse commands - expecting V4_SWAP command
    uint8 command = uint8(commands[0]);
    require(command == uint8(Commands.V4_SWAP), "Only V4_SWAP supported");

    // Parse the input data - matches SwapManager encoding
    bytes memory input = inputs[0];
    (bytes memory packedActions, bytes[] memory params) = abi.decode(input, (bytes, bytes[]));

    // Parse packed actions to verify expected actions
    require(packedActions.length >= 3, "Invalid packed actions");
    uint8 action1 = uint8(packedActions[0]);
    uint8 action2 = uint8(packedActions[1]);
    uint8 action3 = uint8(packedActions[2]);

    require(action1 == uint8(Actions.SWAP_EXACT_IN_SINGLE), "Expected SWAP_EXACT_IN_SINGLE");
    require(action2 == uint8(Actions.SETTLE_ALL), "Expected SETTLE_ALL");
    require(action3 == uint8(Actions.TAKE_ALL), "Expected TAKE_ALL");

    // Parse swap parameters (params[0] contains IV4Router.ExactInputSingleParams)
    IV4Router.ExactInputSingleParams memory swapParams = abi.decode(params[0], (IV4Router.ExactInputSingleParams));

    // Extract pool currencies
    address currency0 = Currency.unwrap(swapParams.poolKey.currency0);
    address currency1 = Currency.unwrap(swapParams.poolKey.currency1);

    // Determine input and output tokens
    address tokenIn = swapParams.zeroForOne ? currency0 : currency1;
    address tokenOut = swapParams.zeroForOne ? currency1 : currency0;

    uint256 amountIn = uint256(swapParams.amountIn);
    uint256 amountOut = amountIn; // 1:1 ratio for testnet

    // Handle input token
    if (tokenIn == address(0)) {
      // Native ETH input
      require(msg.value >= amountIn, "Insufficient ETH sent");
    } else {
      // ERC20 input - transfer from sender
      IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
    }

    // Handle output token (1:1 ratio)
    if (tokenOut == address(0)) {
      // Native ETH output
      payable(msg.sender).transfer(amountOut);
    } else {
      // ERC20 output
      _transferTokens(tokenOut, msg.sender, amountOut);
    }
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
