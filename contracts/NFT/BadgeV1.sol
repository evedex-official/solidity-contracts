// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IPriceFeed} from "../interfaces/IPriceFeed.sol";
import {BurnRegistryV1} from "./burnRegistry/BurnRegistryV1.sol";

contract BadgeV1 is ERC721Upgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
  using MessageHashUtils for bytes32;
  using ECDSA for bytes32;

  /// @dev Unique ID (keccak256) for mint collision protection.
  bytes32 internal _id;

  /// @dev Base URI prefix for tokenURI method.
  string internal _uri;

  /// @dev Total number of tokens created.
  uint256 internal _totalSupply;

  /// @dev Maximum created tokens number (0 if unlimited).
  uint256 internal _maxTotalSupply;

  /// @dev Costs of creating a new token (18 decimals).
  uint256 internal _costsUSD;

  /// @dev Address of signer payload for mint method.
  address internal _signer;

  /// @dev Price feed oracle address (native/usd).
  address internal _priceFeed;

  /// @dev Vault contract address.
  address internal _vault;

  /// @dev Burn regestry contract address.
  address payable internal _burnRegistry;

  /// @dev Storage gap for future upgrades.
  uint256[10] internal __gap;

  struct MintPayload {
    bytes32 id; // Equals of _id field.
    address recipient; // Token recipient address.
    string referral; // Referral code.
    bytes signature; // Signature.
  }

  struct MintForPayload {
    bytes32 id; // Equals of _id field.
    address recipient; // Token recipient address.
    uint256 tokenId; // Transferred token ID.
    uint256 costs; // Payed cost.
    string referral; // Referral code.
    bytes signature; // Signature.
  }

  /// @notice Emited if costs chaned.
  event CostsChanged(uint256 oldCosts, uint256 newCosts);

  /// @notice Emited if new token minted.
  event Minted(address indexed recipient, uint256 tokenId, uint256 costs, string referral);

  event BurnRegistryChanged();

  error BadgeV1TransferForbidden();
  error BadgeV1TokenAlreadyMinted(address recipient);
  error BadgeV1NoTokenAvailable(address recipient, uint256 totalSupply, uint256 maxTotalSupply);
  error BadgeV1InsufficientFundsForMint(address recipient, uint256 costs, uint256 value);
  error BadgeV1TransferFailed(address recipient, uint256 value);
  error BadgeV1NegativeCosts(int256 price);
  error BadgeV1InvalidMintSignature();
  error BadgeV1InvalidBurnRegistry();

  constructor() {
    _disableInitializers();
  }

  /// @notice Initializer.
  /// @param __id keccak256 hash of unique ID.
  /// @param __maxTotalSupply Maximum created tokens number (0 if unlimited).
  /// @param name Token name.
  /// @param symbol Token symbol.
  /// @param uri Base token URI prefix.
  /// @param __costsUSD Costs of creating a new token (18 decimals).
  /// @param __signer Address of signer payload for mint method.
  /// @param __priceFeed Price feed oracle address (native/usd).
  /// @param __vault Vault contract address.
  /// @param __burnRegistry Burn registry contract address.
  function initialize(
    bytes32 __id,
    uint256 __maxTotalSupply,
    string memory name,
    string memory symbol,
    string memory uri,
    uint256 __costsUSD,
    address __signer,
    address __priceFeed,
    address __vault,
    address payable __burnRegistry
  ) public initializer {
    __ERC721_init(name, symbol);
    __Ownable_init(_msgSender());
    __ReentrancyGuard_init();
    _id = __id;
    _maxTotalSupply = __maxTotalSupply;
    _uri = uri;
    _costsUSD = __costsUSD;
    _signer = __signer;
    _priceFeed = __priceFeed;
    _vault = __vault;
    _burnRegistry = __burnRegistry;
  }

  function mintFor(MintForPayload memory payload) external {
    bytes32 signedMessage = keccak256(
      abi.encodePacked(payload.id, payload.recipient, payload.tokenId, payload.costs, payload.referral)
    );
    if (payload.id != _id) {
      revert BadgeV1InvalidMintSignature();
    }
    if (signedMessage.toEthSignedMessageHash().recover(payload.signature) != _signer) {
      revert BadgeV1InvalidMintSignature();
    }

    _safeMint(payload.recipient, payload.tokenId);
    _totalSupply = _totalSupply < payload.tokenId ? payload.tokenId : _totalSupply;

    emit Minted(payload.recipient, payload.tokenId, payload.costs, payload.referral);
  }

  /// @dev See {IERC721Metadata-tokenURI}.
  function _baseURI() internal view override returns (string memory) {
    return _uri;
  }

  /// @notice Forbidden.
  /// @dev See {IERC721-transferFrom}.
  function transferFrom(address, address, uint256) public virtual override {
    revert BadgeV1TransferForbidden();
  }

  /// @return Unique ID.
  function id() public view returns (bytes32) {
    return _id;
  }

  /// @return Total number of tokens created.
  function totalSupply() public view returns (uint256) {
    return _totalSupply;
  }

  /// @return Maximum created tokens number (0 if unlimited).
  function maxTotalSupply() public view returns (uint256) {
    return _maxTotalSupply;
  }

  /// @return Address of signer payload for mint method.
  function signer() public view returns (address) {
    return _signer;
  }

  /// @notice Change of create token costs.
  /// @param newCostsUSD New costs in USD (18 decimals).
  function changeCosts(uint256 newCostsUSD) external onlyOwner {
    uint256 oldCostsUSD = _costsUSD;
    _costsUSD = newCostsUSD;
    emit CostsChanged(oldCostsUSD, newCostsUSD);
  }

  /// @return Costs of creating a new token (18 decimals).
  function costsUSD() public view returns (uint256) {
    return _costsUSD;
  }

  /// @return Costs of creating a new token in ETH (18 decimals).
  function costsETH() public view returns (uint256) {
    (, int256 price, , , ) = IPriceFeed(_priceFeed).latestRoundData();
    if (price <= 0) {
      revert BadgeV1NegativeCosts(price);
    }

    return (_costsUSD * (10 ** IPriceFeed(_priceFeed).decimals())) / uint256(price);
  }

  /// @return Price feed oracle address (native/usd).
  function priceFeed() public view returns (address) {
    return _priceFeed;
  }

  /// @return Vault contract address.
  function vault() public view returns (address) {
    return _vault;
  }

  /// @notice Create new token. One wallet can only own one token.
  /// @param payload Signed payload.
  function mint(MintPayload memory payload) public payable nonReentrant {
    bytes32 signedMessage = keccak256(abi.encodePacked(payload.id, payload.recipient, payload.referral));
    if (payload.id != _id) {
      revert BadgeV1InvalidMintSignature();
    }
    if (signedMessage.toEthSignedMessageHash().recover(payload.signature) != _signer) {
      revert BadgeV1InvalidMintSignature();
    }

    address recipient = payload.recipient;
    if (_maxTotalSupply > 0 && _totalSupply >= _maxTotalSupply) {
      revert BadgeV1NoTokenAvailable(recipient, _totalSupply, _maxTotalSupply);
    }
    if (balanceOf(recipient) > 0) {
      revert BadgeV1TokenAlreadyMinted(recipient);
    }

    uint256 costs = costsETH();
    if (msg.value < costs) {
      revert BadgeV1InsufficientFundsForMint(recipient, costs, msg.value);
    }
    (bool sentToVault, ) = _vault.call{value: costs}("");
    if (!sentToVault) revert BadgeV1TransferFailed(_vault, costs);

    if (msg.value > costs) {
      uint256 remainder = msg.value - costs;
      (bool sentToRecipient, ) = payable(recipient).call{value: remainder}("");
      if (!sentToRecipient) revert BadgeV1TransferFailed(recipient, remainder);
    }

    uint256 tokenId = _totalSupply++;
    _safeMint(recipient, tokenId);

    emit Minted(recipient, tokenId, costs, payload.referral);
  }

  /// @return Burn registry contract address.
  function burnRegistry() public view returns (address) {
    return _burnRegistry;
  }

  /// @param __burnRegistry Burn registry contract address or zero address for disable burn.
  function changeBurnRegistry(address payable __burnRegistry) public onlyOwner {
    _burnRegistry = __burnRegistry;

    emit BurnRegistryChanged();
  }

  function burn(uint256 tokenId) public nonReentrant {
    if (_burnRegistry == address(0)) {
      revert BadgeV1InvalidBurnRegistry();
    }

    address sender = _msgSender();
    if (ownerOf(tokenId) != sender) revert BadgeV1TransferForbidden();

    _burn(tokenId);
    BurnRegistryV1(_burnRegistry).burn(sender, tokenId);
  }
}
