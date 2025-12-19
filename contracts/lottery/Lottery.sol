// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {Storage} from "../storage/Storage.sol";

contract Lottery is Initializable, OwnableUpgradeable, PausableUpgradeable, UUPSUpgradeable {
  using SafeERC20 for IERC20;
  using ECDSA for bytes32;
  using MessageHashUtils for bytes32;

  struct ClaimParams {
    address recipient;
    address token;
    uint256 amount;
    bytes32 nonce;
    bytes signature;
  }

  address public info;

  mapping(bytes32 => bool) public usedNonces;

  event Claimed(address indexed recipient, address indexed token, uint256 amount, bytes32 nonce);
  event Withdrawn(address token, address to, uint256 amount);

  error InvalidSignature();
  error NonceAlreadyUsed();
  error SignerNotFound();

  uint256[48] private __gap;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(address _info, address _owner) public initializer {
    __Ownable_init(_owner);
    __Pausable_init();
    __UUPSUpgradeable_init();
    info = _info;
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function claim(ClaimParams calldata params) external whenNotPaused {
    if (usedNonces[params.nonce]) revert NonceAlreadyUsed();
    address signer = Storage(info).getAddress(keccak256("EH:Lottery:Signer"));
    if (signer == address(0)) revert SignerNotFound();
    bytes32 messageHash = keccak256(
      abi.encodePacked(params.nonce, block.chainid, params.recipient, params.token, params.amount)
    );
    bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
    address recoveredSigner = ethSignedMessageHash.recover(params.signature);
    if (recoveredSigner != signer) revert InvalidSignature();

    usedNonces[params.nonce] = true;
    _transfer(params.token, params.recipient, params.amount);
    emit Claimed(params.recipient, params.token, params.amount, params.nonce);
  }

  function withdraw(address token, address to, uint256 amount) external onlyOwner {
    _transfer(token, to, amount);
    emit Withdrawn(token, to, amount);
  }

  function pause() external onlyOwner {
    _pause();
  }

  function unpause() external onlyOwner {
    _unpause();
  }

  function _transfer(address token, address to, uint256 amount) internal {
    if (token == address(0)) {
      payable(to).transfer(amount);
    } else {
      IERC20(token).safeTransfer(to, amount);
    }
  }

  receive() external payable {}
}
