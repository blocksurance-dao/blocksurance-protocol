// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockContract {
	address public lastReceiver;

	function _transfer(address payable receiver, uint256 amount)
		public
		payable
	{
		lastReceiver = receiver;
		receiver.transfer(amount);
	}

	function _send(address payable receiver, uint256 amount) public payable {
		lastReceiver = receiver;
		bool sent = receiver.send(amount);
		require(sent, "Failed to send Ether");
	}
}
