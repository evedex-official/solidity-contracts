// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

contract VaultV1 is OwnableUpgradeable, PausableUpgradeable {
  mapping(address => uint256) internal _balances;

  mapping(address => bool) internal _distributors;

  uint256 internal _totalDistributed;

  event Distribute(address indexed account, uint256 amount);
  event Skip(address indexed account);
  event Withdrawal(address indexed from, address indexed recipient, uint256 amount);

  error VaultWithdrawFailed(address recipient, uint256 amount);
  error VaultInvalidDistributor(address distributor);
  error VaultDistributeOverflow(uint256 balance, uint256 totalDistributed, uint256 amount);

  constructor() {
    _disableInitializers();
  }

  function initialize() public initializer {
    __Ownable_init(_msgSender());
  }

  receive() external payable {}

  fallback() external payable {}

  function totalDistributed() public view returns (uint256) {
    return _totalDistributed;
  }

  function balanceOf(address account) public view returns (uint256) {
    return _balances[account];
  }

  function addDistributor(address distributor) external onlyOwner {
    _distributors[distributor] = true;
  }

  function removeDistributor(address distributor) external onlyOwner {
    _distributors[distributor] = false;
  }

  function distribute(address account, uint256 amount) external payable {
    address distributor = _msgSender();
    if (!_distributors[distributor]) {
      revert VaultInvalidDistributor(distributor);
    }

    uint256 balance = address(this).balance;
    if (balance < _totalDistributed + amount) {
      revert VaultDistributeOverflow(balance, _totalDistributed, amount);
    }

    _balances[account] += amount;
    _totalDistributed += amount;

    emit Distribute(account, amount);
  }

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  function _withdraw(address from, address recipient) internal {
    uint256 amount = balanceOf(from);
    _balances[from] = 0;
    _totalDistributed -= amount;

    (bool sent, ) = recipient.call{value: amount}("");
    if (!sent) revert VaultWithdrawFailed(recipient, amount);

    emit Withdrawal(from, recipient, amount);
  }

  function withdraw() external whenNotPaused {
    address recipient = _msgSender();
    _withdraw(recipient, recipient);
  }

  function withdrawFrom(address from, address recipient) external whenPaused onlyOwner {
    _withdraw(from, recipient);
  }

  function skip(address account) external whenPaused onlyOwner {
    uint256 balance = _balances[account];
    _balances[account] = 0;
    _totalDistributed -= balance;

    emit Skip(account);
  }

  function withdrawCrumbs(address recipient) external onlyOwner {
    uint256 amount = address(this).balance - _totalDistributed;

    (bool sent, ) = recipient.call{value: amount}("");
    if (!sent) revert VaultWithdrawFailed(recipient, amount);

    emit Withdrawal(address(this), recipient, amount);
  }
}
