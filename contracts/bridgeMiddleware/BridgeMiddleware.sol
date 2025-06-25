// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Storage} from "../storage/Storage.sol";
import {IERC165, ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {Commands} from "@uniswap/universal-router/contracts/libraries/Commands.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUniversalRouter} from "@uniswap/universal-router/contracts/interfaces/IUniversalRouter.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

interface DefaultBridgeGateway {
  function getGateway(address _token) external view returns (address gateway);
}

contract BridgeMiddleware is Context, Initializable, Pausable, ERC165 {
  using SafeERC20 for IERC20;

  address public info;

  address public owner;

  event Deposit(address indexed token, uint256 amount);

  event Refund(address indexed token, uint256 amount);

  error Forbidden();

  error BridgeNotFound();

  error DepositFailed();

  error SwapFailed();

  error InvalidFunctionSelector(bytes4 selector);

  error V4RouterNotFound();

  error UniswapPoolNotFound();

  struct SwapReturnData {
    address token;
    uint256 amount;
  }

  receive() external payable {}

  fallback() external payable {}

  constructor() {
    _disableInitializers();
  }

  function initialize(address _info, address _owner) external initializer {
    info = _info;
    owner = _owner;
  }

  modifier withRole(string memory prefix) {
    bool isCallAllowed = Storage(info).getBool(keccak256(abi.encodePacked(prefix, _msgSender())));
    if (!isCallAllowed) revert Forbidden();

    _;
  }

  function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165) returns (bool) {
    return
      interfaceId == this.depositDefault.selector ||
      interfaceId == this.depositDVF.selector ||
      super.supportsInterface(interfaceId);
  }

  function pause() external withRole("EH:BridgeMiddleware:Officer:") {
    _pause();
  }

  function unpause() external withRole("EH:BridgeMiddleware:Officer:") {
    _unpause();
  }

  function _refund(address token, uint256 amount) internal {
    if (token == address(0)) {
      payable(owner).transfer(amount);
    } else {
      IERC20(token).safeTransfer(owner, amount);
    }
    emit Refund(token, amount);
  }

  function refund(address token, uint256 amount) external whenNotPaused {
    if (_msgSender() != owner) {
      revert Forbidden();
    }
    _refund(token, amount);
  }

  function emergencyRefund(address token, uint256 amount) external withRole("EH:BridgeMiddleware:Officer:") whenPaused {
    _refund(token, amount);
  }

  function _safeApprove(address token, address spender, uint256 amount) internal {
    uint256 allowance = IERC20(token).allowance(address(this), spender);
    if (allowance >= amount) return;

    IERC20(token).approve(spender, 0);
    IERC20(token).approve(spender, amount);
  }

  function depositDefault(
    address token,
    uint256 amount,
    bytes memory data
  ) external payable withRole("EH:BridgeMiddleware:Depositor:") whenNotPaused {
    address bridge = Storage(info).getAddress(keccak256("EH:BridgeMiddleware:Bridge:Default"));
    if (bridge == address(0)) revert BridgeNotFound();

    address gateway = DefaultBridgeGateway(bridge).getGateway(token);

    bool success;
    if (token == address(0)) {
      // solhint-disable-next-line avoid-low-level-calls
      (success, ) = bridge.call{value: amount}(data);
    } else {
      _safeApprove(token, gateway, amount);
      // solhint-disable-next-line avoid-low-level-calls
      (success, ) = bridge.call{value: msg.value}(data);
    }
    if (!success) revert DepositFailed();

    emit Deposit(token, amount);
  }

  function depositDVF(
    address token,
    uint256 amount,
    bytes memory data
  ) external payable withRole("EH:BridgeMiddleware:Depositor:") whenNotPaused {
    address bridge = Storage(info).getAddress(keccak256("EH:BridgeMiddleware:Bridge:DVF"));
    if (bridge == address(0)) revert BridgeNotFound();

    bool success;
    if (token == address(0)) {
      // solhint-disable-next-line avoid-low-level-calls
      (success, ) = bridge.call{value: amount}(data);
    } else {
      _safeApprove(token, bridge, amount);
      // solhint-disable-next-line avoid-low-level-calls
      (success, ) = bridge.call{value: msg.value}(data);
    }
    if (!success) revert DepositFailed();

    emit Deposit(token, amount);
  }

  function swapUniswap(
    address tokenIn,
    uint256 amountIn,
    uint256 minAmountOut,
    bytes32 poolId
  ) external payable withRole("EH:BridgeMiddleware:Depositor:") whenNotPaused returns (SwapReturnData memory) {
    address router = Storage(info).getAddress(keccak256("EH:BridgeMiddleware:Swap:V4Router"));
    bytes memory poolBytes = Storage(info).getBytes(poolId);
    if (router == address(0)) revert V4RouterNotFound();
    if (poolBytes.length == 0) revert UniswapPoolNotFound();
    if (tokenIn != address(0)) {
      _safeApprove(tokenIn, router, amountIn);
    }

    PoolKey memory poolKey = _bytesToPoolKey(poolBytes);
    bool zeroForOne = Currency.unwrap(poolKey.currency0) == tokenIn;

    bytes[] memory inputs = new bytes[](1);
    inputs[0] = abi.encode(
      abi.encodePacked(uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.SETTLE_ALL), uint8(Actions.TAKE_ALL)),
      _buildSwapParamsV4(poolKey, zeroForOne, amountIn, minAmountOut)
    );

    address outputToken;
    uint256 amountOut;
    {
      outputToken = Currency.unwrap(zeroForOne ? poolKey.currency1 : poolKey.currency0);
      uint256 balanceBefore = IERC20(outputToken).balanceOf(address(this));
      IUniversalRouter(router).execute(abi.encodePacked(uint8(Commands.V4_SWAP)), inputs, block.timestamp + 20);
      amountOut = IERC20(outputToken).balanceOf(address(this)) - balanceBefore;
    }
    require(amountOut >= minAmountOut, "Insufficient output amount");
    return SwapReturnData({token: outputToken, amount: amountOut});
  }

  function depositAndSwap(
    bytes4 swapSelector,
    bytes calldata swapCalldata,
    bytes4 depositSelector,
    bytes calldata depositData
  ) external payable withRole("EH:BridgeMiddleware:Depositor:") whenNotPaused {
    if (!supportsInterface(swapSelector)) revert InvalidFunctionSelector(swapSelector);
    if (!supportsInterface(depositSelector)) revert InvalidFunctionSelector(depositSelector);
    bool swapSuccess;
    bytes memory swapResult;
    bool depositSuccess;
    // solhint-disable-next-line avoid-low-level-calls
    (swapSuccess, swapResult) = address(this).delegatecall(abi.encodePacked(swapSelector, swapCalldata));
    if (!swapSuccess) revert SwapFailed();
    SwapReturnData memory swapParsedData = _parseSwapReturnData(swapResult);
    // solhint-disable-next-line avoid-low-level-calls
    (depositSuccess, ) = address(this).delegatecall(
      abi.encodePacked(depositSelector, swapParsedData.token, swapParsedData.amount, depositData)
    );
    if (!depositSuccess) revert DepositFailed();
  }

  function _parseSwapReturnData(bytes memory data) internal pure returns (SwapReturnData memory) {
    require(data.length == 64, "Invalid swap return data length");
    (address token, uint256 amount) = abi.decode(data, (address, uint256));
    return SwapReturnData({token: token, amount: amount});
  }

  function _bytesToPoolKey(bytes memory poolBytes) internal pure returns (PoolKey memory key) {
    require(poolBytes.length == 104, "Invalid pool bytes length");
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

  // /**
  //  * @notice Decodes bytes into a PoolKey struct
  //  * @dev Expected format:
  //  *      - bytes 0-31: currency0 address
  //  *      - bytes 32-63: currency1 address
  //  *      - bytes 64-67: fee (uint24)
  //  *      - bytes 68-71: tickSpacing (int24)
  //  *      - bytes 72-103: hooks address
  //  * @param poolBytes The encoded pool data
  //  * @return key The decoded PoolKey struct
  //  */
  // function _bytesToPoolKey(bytes memory poolBytes) internal pure returns (PoolKey memory key) {
  //   require(poolBytes.length >= 104, "Invalid pool bytes length");
  //   address currency0Address;
  //   address currency1Address;
  //   uint24 fee;
  //   int24 tickSpacing;
  //   address hooksAddress;
  //   assembly {
  //     // Load addresses
  //     currency0Address := mload(add(poolBytes, 32))
  //     currency1Address := mload(add(poolBytes, 64))
  //     // Load uint24 fee (3 bytes)
  //     fee := and(mload(add(poolBytes, 67)), 0xFFFFFF)
  //     // Load int24 tickSpacing (3 bytes)
  //     let rawTickSpacing := and(mload(add(poolBytes, 71)), 0xFFFFFF)
  //     switch and(rawTickSpacing, 0x800000)
  //     case 0 {
  //       tickSpacing := rawTickSpacing
  //     }
  //     default {
  //       tickSpacing := or(rawTickSpacing, 0xFFFFFFFFFFFFFFFFFFFFFFFFFF000000)
  //     }
  //     // Load hooks address
  //     hooksAddress := mload(add(poolBytes, 104))
  //   }

  //   // Create the PoolKey struct with wrapped Currency types
  //   return
  //     PoolKey({
  //       currency0: Currency.wrap(currency0Address),
  //       currency1: Currency.wrap(currency1Address),
  //       fee: fee,
  //       tickSpacing: tickSpacing,
  //       hooks: IHooks(hooksAddress)
  //     });
  // }
}
