// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract DemoV2 is OwnableUpgradeable {
  uint256 public value;

  constructor() {
    _disableInitializers();
  }

  function initialize(uint256 _value) public initializer {
    __Ownable_init(_msgSender());
    value = _value;
  }

  function version() public pure returns (string memory) {
    return "2.0.0";
  }

  function set(uint256 _value) external onlyOwner {
    value = _value;
  }
}
