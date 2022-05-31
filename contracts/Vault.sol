// SPDX-License-Identifier: GPL-v3.0
pragma solidity ^0.8.4;
import "hardhat/console.sol";
import "./IERC20.sol";
import "./IGovernorUpgradeable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract Vault {
	string private _name;
	address private owner;
	address private governor;
	address public serviceContract;

	address private mainVaultAddress;
	address private refAddress;
	uint256 public claim = 0;
	address public lastReceiver;

	enum ProposalState {
		Pending,
		Active,
		Canceled,
		Defeated,
		Succeeded,
		Queued,
		Expired,
		Executed
	}

	constructor(
		address tokenAddress,
		address mainVault,
		address deployerAddress,
		string memory vaultName,
		address _refAddress,
		address _governor
	) {
		serviceContract = tokenAddress;
		owner = deployerAddress;
		mainVaultAddress = mainVault;
		_name = vaultName;
		refAddress = _refAddress;
		governor = _governor;
	}

	event DepositTokens(address user, uint256 tokens, uint256 time);
	event WithdrawTokens(address user, uint256 tokens, uint256 time);
	event ClaimCreated(
		uint256 proposalID,
		address user,
		uint256 value,
		uint256 time
	);
	event ClaimPayout(
		uint256 proposalID,
		address user,
		uint256 value,
		uint256 time
	);

	modifier onlyOwner() {
		require(msg.sender == owner, "You're not the owner!");
		_;
	}

	receive() external payable {}

	function name() public view virtual returns (string memory) {
		return _name;
	}

	function setName(string calldata newname) external onlyOwner {
		_name = newname;
	}

	function storeTokens(uint256 tokenAmount) external onlyOwner {
		require(claim == 0, "Claim in progress!");
		IERC20 tokenContract = IERC20(serviceContract);

		require(
			tokenContract.balanceOf(address(this)) == 0,
			"One deposit per one withdrawal!"
		);
		require(
			tokenContract.balanceOf(msg.sender) >= tokenAmount,
			"Not enough Tokens left!"
		);

		require(
			tokenContract.transferFrom(
				msg.sender,
				address(this),
				tokenAmount
			) == true,
			"Token transfer failed!"
		);
		require(
			tokenContract.transfer(mainVaultAddress, (tokenAmount / 200) * 3),
			"Commission transfer failed!"
		);
		require(
			tokenContract.transfer(refAddress, (tokenAmount / 200)),
			"Referral transfer failed!"
		);
		emit DepositTokens(msg.sender, tokenAmount, block.timestamp);
	}

	function withdrawTokens() public onlyOwner {
		IERC20 tokenContract = IERC20(serviceContract);
		uint256 tokenAmount = tokenContract.balanceOf(address(this));
		if (claim != 0) {
			IGovernorUpgradeable governorContract = IGovernorUpgradeable(
				governor
			);
			IGovernorUpgradeable.ProposalState state = governorContract.state(
				claim
			);
			require(
				state != IGovernorUpgradeable.ProposalState.Active,
				"Claim in progress!"
			);
			require(
				state != IGovernorUpgradeable.ProposalState.Pending,
				"Claim in progress!"
			);
			require(
				state != IGovernorUpgradeable.ProposalState.Queued,
				"Claim in progress!"
			);
			require(
				state != IGovernorUpgradeable.ProposalState.Succeeded,
				"Claim in progress!"
			);
			require(
				state != IGovernorUpgradeable.ProposalState.Executed,
				"Claim in progress!"
			);
		}
		require(tokenAmount > 0, "The vault is empty!");
		require(
			tokenContract.transfer(msg.sender, tokenAmount),
			"Withdrawal failed!"
		);
		emit WithdrawTokens(msg.sender, tokenAmount, block.timestamp);
	}

	function withdrawClaimPayout() public onlyOwner {
		require(claim != 0, "No active claim!");
		IGovernorUpgradeable governorContract = IGovernorUpgradeable(governor);
		IGovernorUpgradeable.ProposalState state = governorContract.state(
			claim
		);
		require(
			state == IGovernorUpgradeable.ProposalState.Executed,
			"Claim not executed!"
		);
		require(address(this).balance >= 0, "Vault has no ETH!");
		IERC20 tokenContract = IERC20(serviceContract);
		uint256 tokenAmount = tokenContract.balanceOf(address(this));

		(bool success, ) = owner.call{ value: address(this).balance }("");
		require(success, "could not withdraw");
		require(
			tokenContract.transfer(mainVaultAddress, tokenAmount),
			"Claim transfer failed!"
		);
		emit ClaimPayout(claim, msg.sender, tokenAmount, block.timestamp);
	}

	function makeClaim(uint256 _amount) external onlyOwner returns (uint256) {
		// function calls the governor contract and creates a claim proposal
		IERC20 tokenContract = IERC20(serviceContract);
		uint256 tokenAmount = tokenContract.balanceOf(address(this));
		require(tokenAmount > 0, "The vault is empty!");
		require(claim == 0, "Claim already exists!");

		address[] memory to = new address[](1);
		to[0] = payable(address(this));
		uint256[] memory amount = new uint256[](1);
		amount[0] = _amount;
		bytes[] memory signature = new bytes[](1);

		string memory symbol = tokenContract.symbol();
		IGovernorUpgradeable governorContract = IGovernorUpgradeable(governor);

		uint256 proposalID = governorContract.propose(
			to,
			amount,
			signature,
			append(
				"Claim lost value from vault ",
				Strings.toHexString(uint256(uint160(address(this)))),
				" for token ",
				symbol,
				" ",
				Strings.toHexString(uint256(uint160(serviceContract)))
			)
		);

		claim = proposalID;
		emit ClaimCreated(proposalID, msg.sender, tokenAmount, block.timestamp);
		return (proposalID);
	}

	function append(
		string memory a,
		string memory b,
		string memory c,
		string memory d,
		string memory e,
		string memory f
	) internal pure returns (string memory) {
		return string(abi.encodePacked(a, b, c, d, e, f));
	}
}
