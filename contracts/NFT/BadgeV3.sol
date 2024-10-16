// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.20;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {BadgeV1} from "./BadgeV1.sol";
import {BurnRegistryV2} from "./burnRegistry/BurnRegistryV2.sol";

contract BadgeV3 is BadgeV1 {
  using MessageHashUtils for bytes32;
  using ECDSA for bytes32;

  error BadgeV3InvalidBurnSignature();

  struct BurnForPayload {
    bytes32 id; // Equals of _id field.
    uint256 tokenId; // Burned token ID.
    bytes signature; // Signature.
  }

  constructor() {
    _disableInitializers();
  }

  /// @param payloads Payloads package (256 elements max).
  function burnForBulk(BurnForPayload[] memory payloads) external {
    for (uint8 i = 0; i < payloads.length; i++) {
      BurnForPayload memory payload = payloads[i];
      bytes32 signedMessage = keccak256(abi.encodePacked(payload.id, payload.tokenId));
      if (payload.id != _id) {
        revert BadgeV3InvalidBurnSignature();
      }
      if (signedMessage.toEthSignedMessageHash().recover(payload.signature) != _signer) {
        revert BadgeV3InvalidBurnSignature();
      }

      _burn(payload.tokenId);
      BurnRegistryV2(_burnRegistry).burnWithoutCosts(ownerOf(payload.tokenId), payload.tokenId);
    }
  }
}
