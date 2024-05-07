// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {IPriceFeed} from "../interfaces/IPriceFeed.sol";

contract ERC721V1 is ERC721Upgradeable, OwnableUpgradeable {
  string internal _uri;

  uint256 internal _totalSupply;

  uint256 internal _commissionUSD; // 18 decimals

  address internal _priceFeed;

  address internal _vault;

  event Minted(address indexed recipient, uint256 tokenId, uint256 commission, string referral);

  error ERC721V1TransferForbidden();
  error ERC721V1TokenAlreadyMinted(address recipient);
  error ERC721V1InsufficientFundsForMint(address recipient, uint256 commission, uint256 value);
  error ERC721V1TransferFailed(address recipient, uint256 value);
  error ERC721V1NegativeCommission(int256 price);

  constructor() {
    _disableInitializers();
  }

  function initialize(
    string memory name,
    string memory symbol,
    string memory uri,
    uint256 commissionUSD,
    address priceFeed,
    address vault
  ) public initializer {
    __ERC721_init(name, symbol);
    __Ownable_init(_msgSender());
    _uri = uri;
    _commissionUSD = commissionUSD;
    _priceFeed = priceFeed;
    _vault = vault;
  }

  function _baseURI() internal view override returns (string memory) {
    return _uri;
  }

  function transferFrom(address, address, uint256) public virtual override {
    revert ERC721V1TransferForbidden();
  }

  function totalSupply() public view returns (uint256) {
    return _totalSupply;
  }

  function changeCommission(uint256 commisionUSD) external onlyOwner {
    _commissionUSD = commisionUSD;
  }

  function _commissionETH() internal view returns (uint256) {
    (, int256 price, , , ) = IPriceFeed(_priceFeed).latestRoundData();
    if (price <= 0) {
      revert ERC721V1NegativeCommission(price);
    }

    return (_commissionUSD * (10 ^ IPriceFeed(_priceFeed).decimals())) / uint256(price);
  }

  function mint(string memory referral) public payable {
    address recipient = _msgSender();
    if (balanceOf(recipient) > 0) {
      revert ERC721V1TokenAlreadyMinted(recipient);
    }

    uint256 commission = _commissionETH();
    if (msg.value < commission) {
      revert ERC721V1InsufficientFundsForMint(recipient, commission, msg.value);
    }
    (bool sentToVault, ) = _vault.call{value: commission}("");
    if (!sentToVault) revert ERC721V1TransferFailed(_vault, commission);

    if (msg.value > commission) {
      uint256 remainder = msg.value - commission;
      (bool sentToRecipient, ) = payable(recipient).call{value: remainder}("");
      if (!sentToRecipient) revert ERC721V1TransferFailed(recipient, remainder);
    }

    uint256 tokenId = _totalSupply++;
    _safeMint(recipient, tokenId);

    emit Minted(recipient, tokenId, commission, referral);
  }
}
