// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {BadgeV1} from "./BadgeV1.sol";

contract BadgeV2 is BadgeV1 {
  constructor() {
    _disableInitializers();
  }

  function changeTotalSupply(uint256 totalSupply) external onlyOwner {
    _totalSupply = totalSupply;
  }
}
