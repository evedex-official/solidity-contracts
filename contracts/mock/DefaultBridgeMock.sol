// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DefaultBridgeMock {
  event OutboundTransferCustomRefund(
    address indexed parentToken,
    address indexed refundTo,
    address indexed to,
    uint256 amount,
    uint256 maxGas,
    uint256 gasPriceBid,
    bytes data
  );

  function getGateway(address) external view returns (address) {
    return address(this);
  }

  function deposit(address token, uint256 amount) external payable {
    // Mock deposit function
  }

  function outboundTransferCustomRefund(
    address _parentToken,
    address _refundTo,
    address _to,
    uint256 _amount,
    uint256 _maxGas,
    uint256 _gasPriceBid,
    bytes calldata _data
  ) external payable returns (bytes memory) {
    emit OutboundTransferCustomRefund(_parentToken, _refundTo, _to, _amount, _maxGas, _gasPriceBid, _data);
    return abi.encodePacked("success");
  }
}
