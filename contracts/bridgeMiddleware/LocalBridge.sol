// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDefaultBridgeGateway} from "../interfaces/IDefaultBridgeGateway.sol";

contract LocalBridge is IDefaultBridgeGateway {
    using SafeERC20 for IERC20;

    function getGateway(address) external view override returns (address) {
        return address(this);
    }

    function transfer(address token, address to, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, to, amount);
    }
}
