// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

contract Registar {
	address payable private owner;

	struct User {
		address user;
		address ref;
		uint256 time;
	}

	User[] private userList;
	mapping(address => User) private userMap;
	mapping(address => bool) private registar;

	mapping(address => address) private refCode;
	mapping(address => address[]) private refferals;

	constructor(address gnosisSafe) {
		owner = payable(gnosisSafe);
		registar[owner] = true;
		refCode[owner] = owner;
	}

	modifier onlyOwner() {
		require(msg.sender == owner, "You're not the owner!");
		_;
	}

	function register(address _addr) external virtual {
		require(_addr != msg.sender, "Duplicate value!");
		require(registar[_addr] == true, "Invalid ref code!");
		require(registar[msg.sender] != true, "Already registered!");

		refCode[msg.sender] = _addr;
		registar[msg.sender] = true;
		refferals[_addr].push(msg.sender);
		userList.push(User(msg.sender, _addr, block.timestamp));
		userMap[msg.sender] = User(msg.sender, _addr, block.timestamp);
	}

	function get(address _addr) public view returns (bool) {
		return registar[_addr];
	}

	function getRef(address _addr) public view returns (address) {
		return refCode[_addr];
	}

	/** @dev Function to get one user by address.
	 * @return  User object
	 */
	function getUser(address _addr)
		external
		view
		onlyOwner
		returns (User memory)
	{
		return userMap[_addr];
	}

	/** @dev Function to get all registered users.
	 * @return Array of User objects
	 */
	function getUsers() external view onlyOwner returns (User[] memory) {
		return userList;
	}

	/** @dev Function to get all refferals for a user.
	 * @return Array of addresses
	 */
	function getRefferals(address _addr)
		external
		view
		returns (address[] memory)
	{
		return refferals[_addr];
	}
}
