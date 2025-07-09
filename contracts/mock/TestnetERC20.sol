// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestnetERC20 is ERC20, Ownable {
  uint8 private _decimals;

  constructor(
    string memory name,
    string memory symbol,
    uint8 decimals_,
    address owner
  ) ERC20(name, symbol) Ownable(owner) {
    _decimals = decimals_;
  }

  function decimals() public view virtual override returns (uint8) {
    return _decimals;
  }

  function mint(address to, uint256 amount) external onlyOwner {
    _mint(to, amount);
  }

  function burn(uint256 amount) external {
    _burn(msg.sender, amount);
  }

  // Allow anyone to mint for testnet purposes
  function faucet(uint256 amount) external {
    _mint(msg.sender, amount);
  }
}
