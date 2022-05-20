// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * @dev Interface of the BLOCKSURANCE Registar.
 */
interface IRegistar {
	struct User {
		address user;
		address ref;
		uint256 time;
	}

	function get(address _addr) external view returns (bool);

	function register(address _addr) external;

	function getRef(address _addr) external view returns (address);

	function setRef(address _addr) external;

	function getUser(address _addr) external view returns (User memory);

	function getUsers() external view returns (User[] memory);

	function getRefferals(address _addr)
		external
		view
		returns (address[] memory);
}
