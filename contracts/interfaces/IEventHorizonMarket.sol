// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IEventHorizonMarket {
	event NewFundingRate(
		uint256 indexed index,
		int256 frLongPerSecond,
		int256 frShortPerSecond,
		int256 longFRStored,
		int256 shortFRStored
	);
	event DepositBalanceChanged(address indexed account, int256 amount, uint256 finalBalance);
	event InstrumentUpdate(uint256 indexed index, string[12] ticker, uint256 leverage);
	event InstrumentDeleted(uint256 indexed index);
	event BasicParamsUpdate(uint256 soLevel, uint256 withdrawMarginLevel, uint256 liquidationFeePercent);
	event DelegateUpdated(address indexed delegator, address indexed delegate, uint256 allowance);
	event BalancesMerkleRootUpdated(bytes32 merkleRoot);

	error InstrumentDoesNotExist();
	error WithdrawMoreThanBalance();
	error UnauthorizedSigner();
	error InvalidSignature();
	error ExpiredSignature();
	error MatcherIsOperational(uint256 validUntil);
	error InvalidMerkleProof(bytes32 leaf);
}
