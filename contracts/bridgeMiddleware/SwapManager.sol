// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Storage} from "../storage/Storage.sol";
import {ISwapManager} from "../interfaces/ISwapManager.sol";
import {Commands} from "@uniswap/universal-router/contracts/libraries/Commands.sol";
import {IUniversalRouter} from "@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

contract SwapManager is Initializable, OwnableUpgradeable, UUPSUpgradeable, ISwapManager {
  using SafeERC20 for IERC20;
  address public info;

  error UnsupportedSwapType(bytes32 swapType);
  error RouterNotFound();
  error PoolNotFound();

  bytes32 public constant UNISWAPV4_SWAP_TYPE = keccak256("UNISWAP_V4");
  uint256[49] __gap;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  receive() external payable {}
  fallback() external payable {}

  function initialize(address _info, address _owner) public initializer {
    __Ownable_init(_owner);
    __UUPSUpgradeable_init();
    info = _info;
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function executeSwap(
    bytes32 swapType,
    address tokenIn,
    uint256 amountIn,
    uint256 minAmountOut,
    bytes calldata swapData
  ) external payable override returns (SwapResult memory) {
    if (tokenIn == address(0)) {
      require(msg.value >= amountIn, "Insufficient ETH sent");
    } else {
      IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
    }
    if (swapType == UNISWAPV4_SWAP_TYPE) {
      SwapResult memory result = _uniswapV4Swap(tokenIn, amountIn, minAmountOut, swapData);
      if (result.tokenOut == address(0)) {
        payable(msg.sender).transfer(result.amountOut);
      } else {
        IERC20(result.tokenOut).safeTransfer(msg.sender, result.amountOut);
      }
      return result;
    }
    revert UnsupportedSwapType(swapType);
  }

  function _uniswapV4Swap(
    address tokenIn,
    uint256 amountIn,
    uint256 minAmountOut,
    bytes calldata swapData
  ) internal returns (SwapResult memory) {
    address router = Storage(info).getAddress(keccak256("EH:BridgeMiddleware:Swap:V4Router"));
    if (router == address(0)) revert RouterNotFound();

    bytes32 poolId = abi.decode(swapData, (bytes32));
    bytes memory poolBytes = Storage(info).getBytes(poolId);
    if (poolBytes.length == 0) revert PoolNotFound();

    if (tokenIn != address(0)) _safeApprove(tokenIn, router, amountIn);

    return _executeUniswapV4Swap(router, tokenIn, amountIn, minAmountOut, poolBytes);
  }

  function _executeUniswapV4Swap(
    address router,
    address tokenIn,
    uint256 amountIn,
    uint256 minAmountOut,
    bytes memory poolBytes
  ) internal returns (SwapResult memory) {
    PoolKey memory poolKey = _bytesToPoolKey(poolBytes);
    bool zeroForOne = Currency.unwrap(poolKey.currency0) == tokenIn;

    bytes[] memory inputs = new bytes[](1);
    inputs[0] = abi.encode(
      abi.encodePacked(uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.SETTLE_ALL), uint8(Actions.TAKE_ALL)),
      _buildSwapParamsV4(poolKey, zeroForOne, amountIn, minAmountOut)
    );

    address outputToken = Currency.unwrap(zeroForOne ? poolKey.currency1 : poolKey.currency0);
    uint256 balanceBefore = _getBalance(outputToken, address(this));
    uint256 ethValue = tokenIn == address(0) ? amountIn : 0;
    IUniversalRouter(router).execute{value: ethValue}(
      abi.encodePacked(uint8(Commands.V4_SWAP)),
      inputs,
      block.timestamp
    );
    uint256 amountOut = _getBalance(outputToken, address(this)) - balanceBefore;

    require(amountOut >= minAmountOut, "Insufficient output amount");
    return SwapResult({tokenOut: outputToken, amountOut: amountOut});
  }

  function _buildSwapParamsV4(
    PoolKey memory poolKey,
    bool zeroForOne,
    uint256 amountIn,
    uint256 minAmountOut
  ) internal pure returns (bytes[] memory params) {
    params = new bytes[](3);
    params[0] = abi.encode(
      IV4Router.ExactInputSingleParams({
        poolKey: poolKey,
        zeroForOne: zeroForOne,
        amountIn: uint128(amountIn),
        amountOutMinimum: uint128(minAmountOut),
        hookData: bytes("")
      })
    );
    params[1] = abi.encode(zeroForOne ? poolKey.currency0 : poolKey.currency1, amountIn);
    params[2] = abi.encode(zeroForOne ? poolKey.currency1 : poolKey.currency0, minAmountOut);
  }

  function _bytesToPoolKey(bytes memory poolBytes) internal pure returns (PoolKey memory) {
    (address currency0Address, address currency1Address, uint24 fee, int24 tickSpacing, address hooksAddress) = abi
      .decode(poolBytes, (address, address, uint24, int24, address));
    return
      PoolKey({
        currency0: Currency.wrap(currency0Address),
        currency1: Currency.wrap(currency1Address),
        fee: fee,
        tickSpacing: tickSpacing,
        hooks: IHooks(hooksAddress)
      });
  }

  function _safeApprove(address token, address spender, uint256 amount) internal {
    uint256 allowance = IERC20(token).allowance(address(this), spender);
    if (allowance >= amount) return;

    IERC20(token).approve(spender, 0);
    IERC20(token).approve(spender, amount);
  }

  function _getBalance(address token, address account) internal view returns (uint256) {
    if (token == address(0)) {
      return account.balance;
    } else {
      return IERC20(token).balanceOf(account);
    }
  }
}
