// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Storage} from "../storage/Storage.sol";
import {IDepositManager} from "../interfaces/IDepositManager.sol";

interface DefaultBridgeGateway {
  function getGateway(address _token) external view returns (address gateway);
}

contract DepositManager is Initializable, OwnableUpgradeable, UUPSUpgradeable, IDepositManager {
  using SafeERC20 for IERC20;

  address public info;

  error UnsupportedDepositType(bytes32 depositType);
  error BridgeNotFound();
  error DepositFailed();
  error InsufficientEthSent();

  bytes32 public constant DVF_DEPOSIT_TYPE = keccak256("DVF");
  bytes32 public constant DEFAULT_DEPOSIT_TYPE = keccak256("DEFAULT");

  uint256[49] __gap;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(address _info, address _owner) public initializer {
    __Ownable_init(_owner);
    __UUPSUpgradeable_init();
    info = _info;
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function withdraw(address token, address to, uint256 amount) external onlyOwner {
    _transfer(token, to, amount);
  }

  function executeDeposit(
    bytes32 depositType,
    address token,
    uint256 amount,
    bytes calldata data,
    bool overrideData
  ) external payable override returns (bool) {
    if (token == address(0)) {
      if (msg.value < amount) revert InsufficientEthSent();
    } else {
      IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }
    if (depositType == DVF_DEPOSIT_TYPE) return _depositDVF(token, amount, data, overrideData);
    if (depositType == DEFAULT_DEPOSIT_TYPE) return _depositDefault(token, amount, data, overrideData);
    revert UnsupportedDepositType(depositType);
  }

  function _depositDVF(address token, uint256 amount, bytes calldata data, bool overrideData) internal returns (bool) {
    address bridge = Storage(info).getAddress(keccak256("EH:BridgeMiddleware:Bridge:DVF"));
    if (bridge == address(0)) revert BridgeNotFound();
    bytes memory depositData = data;
    if (overrideData) {
      depositData = _overrideDVFBridgeData(data, amount, token);
    }
    return _executeBridgeCall(bridge, bridge, token, amount, depositData);
  }

  function _depositDefault(
    address token,
    uint256 amount,
    bytes calldata data,
    bool overrideData
  ) internal returns (bool) {
    address bridge = Storage(info).getAddress(keccak256("EH:BridgeMiddleware:Bridge:Default"));
    if (bridge == address(0)) revert BridgeNotFound();
    bytes memory depositData = data;
    if (overrideData) {
      depositData = _overrideDefaultBridgeData(data, amount, token);
    }
    return _executeBridgeCall(bridge, DefaultBridgeGateway(bridge).getGateway(token), token, amount, depositData);
  }

  function _executeBridgeCall(
    address bridge,
    address approvalTarget,
    address token,
    uint256 amount,
    bytes memory data
  ) internal returns (bool) {
    bool success;
    if (token == address(0)) {
      // solhint-disable-next-line avoid-low-level-calls
      (success, ) = bridge.call{value: amount}(data);
    } else {
      _safeApprove(token, approvalTarget, amount);
      // solhint-disable-next-line avoid-low-level-calls
      (success, ) = bridge.call(data);
    }
    return success;
  }

  function _safeApprove(address token, address spender, uint256 amount) internal {
    uint256 allowance = IERC20(token).allowance(address(this), spender);
    if (allowance >= amount) return;
    IERC20(token).approve(spender, 0);
    IERC20(token).approve(spender, amount);
  }

  function _transfer(address token, address to, uint256 amount) internal {
    if (token == address(0)) {
      payable(to).transfer(amount);
    } else {
      IERC20(token).safeTransfer(to, amount);
    }
  }

  function _overrideDefaultBridgeData(
    bytes calldata data,
    uint256 amount,
    address token
  ) internal pure returns (bytes memory) {
    bytes4 selector = bytes4(data[:4]);
    (, address refundTo, address to, , uint256 maxGas, uint256 gasPriceBid, bytes memory bridgeData) = abi.decode(
      data[4:],
      (address, address, address, uint256, uint256, uint256, bytes)
    );
    return abi.encodeWithSelector(selector, token, refundTo, to, amount, maxGas, gasPriceBid, bridgeData);
  }

  function _overrideDVFBridgeData(
    bytes calldata data,
    uint256 amount,
    address token
  ) internal pure returns (bytes memory) {
    bytes4 selector = bytes4(data[:4]);
    (, , bytes32 quoteId) = abi.decode(data[4:], (address, uint256, bytes32));
    return abi.encodeWithSelector(selector, token, amount, quoteId);
  }
}
