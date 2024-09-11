//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "./Mintable.sol";

contract USDT is Mintable {
    constructor() ERC20("USDT", "USDT") ERC20Capped(100000e6 * 1e6) Mintable(6) {}
}
