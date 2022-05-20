// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * @dev Interface of the BLOCKSURANCE WhiteList.
 */
interface IWhiteList {
	struct Token {
		string name;
		string symbol;
		address tokenAddress;
	}

	function get(address _addr) external view returns (bool);

	function listToken(
		string calldata name,
		string calldata symbol,
		address _addr
	) external;

	function removeToken(address _addr) external;

	function getListings() external view returns (Token[] memory);
}
