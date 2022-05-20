// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// learn more: https://docs.openzeppelin.com/contracts/4.x/erc20

contract ERC20Coin is ERC20, Ownable {
	uint256 public MAX_SUPPLY;
	uint256 public totalAirDropped;

	constructor(
		string memory name,
		string memory symbol,
		uint256 supply,
		address projectStarter
	) ERC20(name, symbol) {
		MAX_SUPPLY = supply * 10**18;
		// _mint(address(0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9), supply / 10);
		transferOwnership(projectStarter);
	}

	event AirDropped(address winner, uint256 amount);

	function mint(address to, uint256 amount) public onlyOwner {
		uint256 supply = totalSupply();
		require(supply + amount <= MAX_SUPPLY, "Not enough tokens left!");
		_mint(to, amount);
	}

	function airdrop(address[] calldata _addresses, uint256 amount)
		public
		onlyOwner
	{
		uint256 supply = totalSupply();
		uint256 _amountSum = amount * _addresses.length;
		require(supply + _amountSum <= MAX_SUPPLY, "Not enough tokens left!");
		for (uint8 i; i < _addresses.length; i++) {
			_mint(_addresses[i], amount);
			totalAirDropped += amount;
			emit AirDropped(_addresses[i], amount);
		}
	}
}
