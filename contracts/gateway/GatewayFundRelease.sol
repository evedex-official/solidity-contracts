// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Gateway implementation for releasing locked funds during L3 -> L2 migration.
// Deployed as a new implementation for the Gateway and Bridge proxies.
// Restricted to a single authorized recipient (Ledger EOA).
contract GatewayFundRelease {
  using SafeERC20 for IERC20;

  address public immutable authorizedRecipient;

  error Unauthorized(address to);

  constructor(address _authorizedRecipient) {
    authorizedRecipient = _authorizedRecipient;
  }

  function releaseFunds(address token, address to, uint256 amount) external {
    if (to != authorizedRecipient) revert Unauthorized(to);
    IERC20(token).safeTransfer(to, amount);
  }

  function releaseETH(address payable to, uint256 amount) external {
    if (to != authorizedRecipient) revert Unauthorized(to);
    (bool sent, ) = to.call{value: amount}("");
    require(sent, "ETH transfer failed");
  }

  receive() external payable {}
}
