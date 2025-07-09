// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./TestnetERC20.sol";

/**
 * @title TestnetWETH
 * @notice WETH mock for testnet that handles wrapping/unwrapping ETH
 * @dev This mock provides 1:1 ETH to WETH conversion for testing purposes
 */
contract TestnetWETH is TestnetERC20 {
  event Deposit(address indexed dst, uint256 wad);
  event Withdrawal(address indexed src, uint256 wad);

  constructor(address owner) TestnetERC20("Wrapped Ether", "WETH", 18, owner) {}

  receive() external payable {
    deposit();
  }

  function deposit() public payable {
    _mint(msg.sender, msg.value);
    emit Deposit(msg.sender, msg.value);
  }

  function withdraw(uint256 wad) public {
    require(balanceOf(msg.sender) >= wad, "Insufficient balance");
    _burn(msg.sender, wad);
    payable(msg.sender).transfer(wad);
    emit Withdrawal(msg.sender, wad);
  }
}
