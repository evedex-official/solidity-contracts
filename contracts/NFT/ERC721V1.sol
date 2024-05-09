// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {IPriceFeed} from "../interfaces/IPriceFeed.sol";

contract ERC721V1 is ERC721Upgradeable, OwnableUpgradeable {
  using MessageHashUtils for bytes32;
  using ECDSA for bytes32;

  bytes32 internal _id;

  string internal _uri;

  uint256 internal _totalSupply;

  uint256 internal _costsUSD; // 18 decimals

  address internal _signer;

  address internal _priceFeed;

  address internal _vault;

  struct MintPayload {
    bytes32 id;
    address recipient;
    string referral;
    bytes signature;
  }

  event CostsChanged(uint256 oldCosts, uint256 newCosts);
  event Minted(address indexed recipient, uint256 tokenId, uint256 costs, string referral);

  error ERC721V1TransferForbidden();
  error ERC721V1TokenAlreadyMinted(address recipient);
  error ERC721V1InsufficientFundsForMint(address recipient, uint256 costs, uint256 value);
  error ERC721V1TransferFailed(address recipient, uint256 value);
  error ERC721V1NegativeCosts(int256 price);
  error ERC721V1InvalidMintSignature();

  constructor() {
    _disableInitializers();
  }

  function initialize(
    bytes32 __id,
    string memory name,
    string memory symbol,
    string memory uri,
    uint256 __costsUSD,
    address signer,
    address priceFeed,
    address vault
  ) public initializer {
    __ERC721_init(name, symbol);
    __Ownable_init(_msgSender());
    _id = __id;
    _uri = uri;
    _costsUSD = __costsUSD;
    _signer = signer;
    _priceFeed = priceFeed;
    _vault = vault;
  }

  function _baseURI() internal view override returns (string memory) {
    return _uri;
  }

  function transferFrom(address, address, uint256) public virtual override {
    revert ERC721V1TransferForbidden();
  }

  function id() public view returns (bytes32) {
    return _id;
  }

  function totalSupply() public view returns (uint256) {
    return _totalSupply;
  }

  function changeCosts(uint256 newCostsUSD) external onlyOwner {
    uint256 oldCostsUSD = _costsUSD;
    _costsUSD = newCostsUSD;
    emit CostsChanged(oldCostsUSD, newCostsUSD);
  }

  function costsUSD() public view returns (uint256) {
    return _costsUSD;
  }

  function costsETH() public view returns (uint256) {
    (, int256 price, , , ) = IPriceFeed(_priceFeed).latestRoundData();
    if (price <= 0) {
      revert ERC721V1NegativeCosts(price);
    }

    return (_costsUSD * (10 ** IPriceFeed(_priceFeed).decimals())) / uint256(price);
  }

  function mint(MintPayload memory payload) public payable {
    bytes32 signedMessage = keccak256(abi.encodePacked(payload.id, payload.recipient, payload.referral));
    if (payload.id != _id) {
      revert ERC721V1InvalidMintSignature();
    }
    if (signedMessage.toEthSignedMessageHash().recover(payload.signature) != _signer) {
      revert ERC721V1InvalidMintSignature();
    }

    address recipient = payload.recipient;
    if (balanceOf(recipient) > 0) {
      revert ERC721V1TokenAlreadyMinted(recipient);
    }

    uint256 costs = costsETH();
    if (msg.value < costs) {
      revert ERC721V1InsufficientFundsForMint(recipient, costs, msg.value);
    }
    (bool sentToVault, ) = _vault.call{value: costs}("");
    if (!sentToVault) revert ERC721V1TransferFailed(_vault, costs);

    if (msg.value > costs) {
      uint256 remainder = msg.value - costs;
      (bool sentToRecipient, ) = payable(recipient).call{value: remainder}("");
      if (!sentToRecipient) revert ERC721V1TransferFailed(recipient, remainder);
    }

    uint256 tokenId = _totalSupply++;
    _safeMint(recipient, tokenId);

    emit Minted(recipient, tokenId, costs, payload.referral);
  }
}
