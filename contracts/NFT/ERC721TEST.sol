// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract TestNFT is Initializable, ERC721Upgradeable, OwnableUpgradeable {
  uint256 private _nextTokenId;

  /// @dev Base URI prefix for tokenURI method.
  string internal _uri;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  function initialize(address initialOwner, string memory uri) initializer public {
    __ERC721_init("testNFT", "testNFT");
    __Ownable_init(initialOwner);
    _uri = uri;
  }

  function _baseURI() internal view override returns (string memory) {
    return _uri;
  }

  function safeMint(address to) public onlyOwner {
    uint256 tokenId = _nextTokenId++;
    _safeMint(to, tokenId);
  }
}
