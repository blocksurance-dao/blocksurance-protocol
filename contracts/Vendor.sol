// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;
import "./IRegistar.sol";
import "./IERC20.sol";

contract Vendor {
	constructor(
		address _tokenAddr,
		address _registar,
		address gnosisSafe
	) {
		registar = _registar;
		owner = payable(gnosisSafe);
		serviceContract = _tokenAddr;
	}

	address private registar;
	address payable private owner;
	address private serviceContract;
	bool private paused = false;

	uint256 public supply;
	uint256 public totalSold;
	uint256 public tokensPerEth = 40000; // ~$0.05 per token
	uint256 public minimalBuy = 20_000 ether;

	event BuyTokens(address buyer, uint256 amountOfETH, uint256 tokens);

	modifier onlyOwner() {
		require(msg.sender == owner, "You're not the owner!");
		_;
	}

	modifier Registered() {
		IRegistar registarContract = IRegistar(registar);
		bool registered = registarContract.get(msg.sender);
		require(registered == true, "Unregistered user!");
		_;
	}

	modifier notPaused() {
		require(paused == false, "Sales temporarily halted!");
		_;
	}

	receive() external payable {}

	function getMinBuy() external view returns (uint256) {
		return minimalBuy;
	}

	function setMinBuy(uint256 _amount) external onlyOwner {
		minimalBuy = _amount;
	}

	function getPrice() external view returns (uint256) {
		return tokensPerEth;
	}

	function setPrice(uint256 _amount) external onlyOwner {
		tokensPerEth = _amount;
	}

	function setPaused(bool value) public onlyOwner {
		paused = value;
	}

	function checkSupply() public view returns (uint256) {
		IERC20 tokenContract = IERC20(serviceContract);
		return tokenContract.balanceOf(address(this));
	}

	function balance() public view returns (uint256) {
		return address(this).balance;
	}

	function buyTokens() external payable notPaused Registered {
		uint256 tokenAmount = msg.value * tokensPerEth;
		totalSold = totalSold + tokenAmount;
		IERC20 tokenContract = IERC20(serviceContract);
		supply = tokenContract.balanceOf(address(this));

		require(totalSold <= supply, "Not enough tokens left!");
		require(tokenAmount >= minimalBuy, "Less than minimal buy amount!");
		require(supply >= tokenAmount, "Not enough Tokens left!");
		supply = supply - tokenAmount;

		require(
			tokenContract.transfer(msg.sender, tokenAmount) == true,
			"Failed to complete buy!"
		);
		emit BuyTokens(msg.sender, msg.value, tokenAmount);
	}

	function withdraw(uint256 amount) public onlyOwner {
		require(address(this).balance >= amount, "Not enough ETH!");
		(bool success, ) = owner.call{ value: amount }("");
		require(success, "could not withdraw");
	}
}
