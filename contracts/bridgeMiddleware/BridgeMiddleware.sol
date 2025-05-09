// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Storage} from "../storage/Storage.sol";

interface DefaultBridgeGateway {
  function getGateway(address _token) external view returns (address gateway);
}

contract BridgeMiddleware is Context, Initializable, Pausable {
  using SafeERC20 for IERC20;

  address public info;

  address public owner;

  event Deposit(address indexed token, uint256 amount);

  event Refund(address indexed token, uint256 amount);

  error Forbidden();

  error BridgeNotFound();

  error DepositFailed();

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

  function depositAcross(
    address token,
    uint256 amount,
    bytes memory data
  ) external payable withRole("EH:BridgeMiddleware:Depositor:") whenNotPaused {
    address bridge = Storage(info).getAddress(keccak256("EH:BridgeMiddleware:Bridge:Across"));
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
}
