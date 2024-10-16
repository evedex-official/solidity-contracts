// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {BurnRegistryV1} from "./BurnRegistryV1.sol";

contract BurnRegistryV2 is BurnRegistryV1 {
  constructor() {
    _disableInitializers();
  }

  function burn(address wallet, uint256 tokenId) external override whenNotPaused {
    address sender = _msgSender();
    if (sender != _token) revert BurnRegistryInvalidSender(sender);

    uint256 index = _totalSupply++;
    _burned[index] = wallet;
    _burnedCount[wallet] += 1;

    emit Burned(wallet, tokenId, index);
  }
}
