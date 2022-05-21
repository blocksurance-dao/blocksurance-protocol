// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract WhiteList {
	address payable private owner;
	mapping(address => bool) public whiteList;

	constructor(address gnosisSafe) {
		owner = payable(gnosisSafe);
	}

	modifier onlyOwner() {
		require(msg.sender == owner, "You're not the owner!");
		_;
	}

	event ListToken(address _address, uint256 time);
	event DelistToken(address _address, uint256 time);

	struct Token {
		string name;
		string symbol;
		address tokenAddress;
	}

	Token[] private tokenList;

	function get(address _addr) public view returns (bool) {
		// Check if token address is listed on platform
		return whiteList[_addr];
	}

	function listToken(
		string calldata name,
		string calldata symbol,
		address _addr
	) external onlyOwner {
		// Add token address to listed tokens
		require(whiteList[_addr] != true, "Token Exists!");
		whiteList[_addr] = true;
		tokenList.push(Token(name, symbol, _addr));
		emit ListToken(_addr, block.timestamp);
	}

	function removeToken(address _addr) external onlyOwner {
		// Remove token listing.
		require(whiteList[_addr] == true, "Token not listed!");
		delete whiteList[_addr];

		for (uint256 i = 0; i < tokenList.length; i++) {
			if (tokenList[i].tokenAddress == _addr) {
				tokenList[i] = tokenList[tokenList.length - 1];
				tokenList.pop();
				emit DelistToken(_addr, block.timestamp);
				break;
			}
		}
	}

	/** @dev Function to get all whitelisted tokens.
	 * @return Array of token objects
	 */
	function getListings() external view returns (Token[] memory) {
		return tokenList;
	}
}
