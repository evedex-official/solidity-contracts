// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract EHMarket is AccessControlEnumerable {
	using SafeERC20 for IERC20;
	using ECDSA for bytes32;
	using MessageHashUtils for bytes32;

	error InvalidSignature();
	error WithdrawMoreThanBalance();
	error MatcherIsOperational(uint256 validUntil);
	error UnauthorizedSigner();
	error ExpiredSignature();
	error InvalidParameters();
	error ZeroBalance();
	
	event UserBalanceChanged(address indexed account, int256 amount, uint256 finalBalance);
	event DelegateUpdated(address indexed delegator, address indexed delegate, uint256 allowance);

	bytes32 public constant MATCHER_ROLE = keccak256("MATCHER_ROLE");
	address public immutable COLLATERAL;

	mapping(address => uint) private _userBalances;

	constructor(address[] memory _matchers, address _collateral)  {
		_grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
		for(uint i = 0; i < _matchers.length; i++) {
			_grantRole(MATCHER_ROLE, _matchers[i]);
		}
		COLLATERAL = _collateral;
	}

	//////////////////////////
	//  User functions
	//////////////////////////

	function depositAsset(uint256 amount) external {
		depositAssetTo(_msgSender(), amount);
	}

	function depositAssetTo(address to, uint256 amount) public {
		uint newUserBalance = _userBalances[to] + amount; 
		_userBalances[to] = newUserBalance;
		emit UserBalanceChanged(to, int256(amount), newUserBalance);
		IERC20(COLLATERAL).safeTransferFrom(_msgSender(), address(this), amount);
	}

	function withdrawAsset(
		address from,
		uint256 amount,
		address signer,
		uint256 deadline,
		bytes memory signature
	) external {
		require(block.timestamp < deadline, ExpiredSignature());
		require(hasRole(MATCHER_ROLE, signer), UnauthorizedSigner());
		bytes32 digest = keccak256(abi.encode(from, amount, signer, address(this), deadline));
		require(digest.toEthSignedMessageHash().recover(signature) == signer, InvalidSignature());
		_withdrawAsset(from, amount);
	}

	function _withdrawAsset(address from, uint256 amount ) internal {
		uint256 userBalance = _userBalances[from];
		require(amount <= userBalance, WithdrawMoreThanBalance());
		uint actualBalance = userBalance - amount;
		_setUserBalance(from, actualBalance);

		emit UserBalanceChanged(from, -int256(amount), actualBalance);
		IERC20(COLLATERAL).safeTransfer(from, amount);
	}

	function setDelegate(address delegate, uint256 allowance) external {
		emit DelegateUpdated(_msgSender(), delegate, allowance);
	}

	function _setUserBalance(address _user, uint256 _amount) internal {
		_userBalances[_user] = _amount;
	}

	//////////////////////////
	//  Getter functions
	//////////////////////////

	function getUserBalance(address _user) public view returns (uint256 balance) {
		return _userBalances[_user];
	}

	//////////////////////////
	//  Privileged functions
	//////////////////////////

	function withdrawExchangeTokens(address _to) external onlyRole(DEFAULT_ADMIN_ROLE) {
		require(_to != address(0), InvalidParameters());
		uint exchangeBalance = _userBalances[address(0)];
		require(exchangeBalance > 0, ZeroBalance());
		_userBalances[address(0)] = 0;
		IERC20(COLLATERAL).safeTransfer(_to, exchangeBalance);
	}

	function updateUserBalances(address[] calldata _userAddresses, int256[] calldata _change) external onlyRole(MATCHER_ROLE) {
		uint len = _userAddresses.length;
		require(len == _change.length, InvalidParameters());
		for(uint i = 0; i < len; i++) {
			address user = _userAddresses[i];
			uint256 newBalance = uint256(int256(_userBalances[user]) + _change[i]);
			_setUserBalance(user, newBalance);
			emit UserBalanceChanged(user, _change[i], newBalance);
		}
	}

}
