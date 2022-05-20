// SPDX-License-Identifier: GPL-v3.0
pragma solidity ^0.8.4;
import "./IERC20.sol";
import "./IRegistar.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract BLOCKSURANCE is
	Initializable,
	ERC20Upgradeable,
	ERC20BurnableUpgradeable,
	OwnableUpgradeable,
	ERC20PermitUpgradeable,
	ERC20VotesUpgradeable
{
	/// @custom:oz-upgrades-unsafe-allow constructor
	// constructor() {
	//     _disableInitializers();
	// }

	function initialize(
		address tokenAddress,
		address _registar,
		address gnosisSafe
	) public initializer {
		__ERC20_init("BLOCKSURANCE", "GOV");
		__ERC20Burnable_init();
		__Ownable_init();
		__ERC20Permit_init("BLOCKSURANCE");
		__ERC20Votes_init();
		registar = _registar;
		transferOwnership(payable(gnosisSafe));
		serviceContract = tokenAddress;
	}

	// The following functions are overrides required by Solidity.

	function _afterTokenTransfer(
		address from,
		address to,
		uint256 amount
	) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
		super._afterTokenTransfer(from, to, amount);
	}

	function _mint(address to, uint256 amount)
		internal
		override(ERC20Upgradeable, ERC20VotesUpgradeable)
	{
		super._mint(to, amount);
	}

	function _burn(address account, uint256 amount)
		internal
		override(ERC20Upgradeable, ERC20VotesUpgradeable)
	{
		super._burn(account, amount);
	}

	// address payable private owner;
	address public serviceContract;
	uint8[] private _rates = [21, 33, 45];
	address private registar;

	uint256 public totalStaked;
	uint256 public currentStaked;
	bool private paused = false;
	uint64 public minStakingPeriod = 90; //days
	uint64 public maxStakingPeriod = 450; //days
	uint256 private minimalStake = 20_000 ether; //~$1000 worth

	struct Stake {
		address _addr;
		uint256 amount;
		uint64 duration;
		uint256 expiration;
		uint8 rate;
	}

	Stake[] private activeStakes;
	mapping(address => Stake) private stakes;

	event Staked(address staker, uint256 amount, uint256 time);
	event StakeBurned(address contributor, uint256 amount, uint256 time);

	modifier isStakeable(uint64 durationInDays) {
		require(
			durationInDays >= minStakingPeriod,
			"Min staking period is 90 days!"
		);
		require(
			durationInDays <= maxStakingPeriod,
			"Max staking period exceeded!"
		);
		require(stakes[msg.sender].amount == 0, "You already have a Stake!");
		_;
	}

	modifier stakingPaused() {
		require(paused == false, "Staking is temporarily halted!");
		_;
	}

	modifier stakeExpired() {
		require(
			block.timestamp >= stakes[msg.sender].expiration,
			"Lockup period not over!"
		);
		_;
	}

	modifier Registered() {
		IRegistar registarContract = IRegistar(registar);
		bool registered = registarContract.get(msg.sender);
		require(registered == true, "Unregistered user!");
		_;
	}

	receive() external payable {}

	function setMinStake(uint256 _amount) external onlyOwner {
		minimalStake = _amount;
	}

	function getMinStake() external view returns (uint256) {
		return minimalStake;
	}

	function setMaxStakingPeriod(uint64 _days) external onlyOwner {
		maxStakingPeriod = _days;
	}

	function _getAPR(uint64 _days) internal view returns (uint8) {
		if (_days > 360) {
			return _rates[2]; // high
		} else if (_days > 180) {
			return _rates[1]; // mid
		} else {
			return _rates[0]; // low
		}
	}

	function stakingEnabled(bool value) public onlyOwner {
		paused = !value;
	}

	function getUserStake(address _address) public view returns (Stake memory) {
		return stakes[_address];
	}

	function setRates(
		uint8 low,
		uint8 mid,
		uint8 high
	) public onlyOwner {
		_rates = [low, mid, high];
	}

	function getRates() public view returns (uint8[] memory) {
		return _rates;
	}

	function checkSupply() public view returns (uint256) {
		IERC20 tokenContract = IERC20(serviceContract);
		return tokenContract.balanceOf(address(this));
	}

	function _refferal(uint256 amount) internal returns (bool) {
		IERC20 tokenContract = IERC20(serviceContract);
		IRegistar registarContract = IRegistar(registar);
		address refAddress = registarContract.getRef(msg.sender);
		uint256 rewardAmount = amount / 25; //4%

		if (refAddress != address(0x0)) {
			require(
				tokenContract.balanceOf(address(this)) >= rewardAmount,
				"Not enough Tokens left!"
			);
			require(
				tokenContract.transfer(refAddress, rewardAmount) == true,
				"Refferal reward failed!"
			);
		}

		return true;
	}

	function stakeTokens(uint256 tokenAmount, uint64 durationInDays)
		external
		stakingPaused
		Registered
		isStakeable(durationInDays)
	{
		IERC20 tokenContract = IERC20(serviceContract);

		require(tokenAmount >= minimalStake, "Amount less than minimal stake!");

		require(
			tokenContract.balanceOf(msg.sender) >= tokenAmount,
			"You don't have enough tokens!"
		);

		uint256 stakeUntil = block.timestamp + (durationInDays * (1 days));
		totalStaked = totalStaked + tokenAmount;
		currentStaked = currentStaked + tokenAmount;

		uint8 rate = _getAPR(durationInDays);
		activeStakes.push(
			Stake(msg.sender, tokenAmount, durationInDays, stakeUntil, rate)
		);
		stakes[msg.sender] = Stake(
			msg.sender,
			tokenAmount,
			durationInDays,
			stakeUntil,
			rate
		);

		require(
			tokenContract.transferFrom(
				msg.sender,
				address(this),
				tokenAmount
			) == true,
			"Token transfer failed!"
		);

		require(_refferal(tokenAmount) == true, "Refferal payout failed!");

		_mint(msg.sender, tokenAmount);
		emit Staked(msg.sender, tokenAmount, block.timestamp);
	}

	function burnStake(address _addr) public stakeExpired {
		IERC20 tokenContract = IERC20(serviceContract);
		uint256 amount = stakes[_addr].amount;
		require(amount > 0, "You don't have a stake!");
		require(balanceOf(_addr) >= amount, "You lost you governance tokens!");
		uint256 reward = ((amount *
			stakes[_addr].duration *
			stakes[_addr].rate) / 36500);

		require(
			tokenContract.balanceOf(address(this)) >= amount + reward,
			"Not enough Tokens left!"
		);

		delete stakes[_addr];
		currentStaked = currentStaked - amount;

		for (uint256 i = 0; i < activeStakes.length; i++) {
			if (activeStakes[i]._addr == _addr) {
				activeStakes[i] = activeStakes[activeStakes.length - 1];
				activeStakes.pop();
				break;
			}
		}

		require(
			tokenContract.transfer(_addr, amount + reward) == true,
			"Failed to complete reward!"
		);

		_burn(_addr, amount);
		emit StakeBurned(_addr, amount, block.timestamp);
	}

	function transferTokens(uint256 amount) public onlyOwner {
		IERC20 tokenContract = IERC20(serviceContract);
		uint256 tokenAmount = tokenContract.balanceOf(address(this));
		require(tokenAmount >= amount, "Not enough tokens!");
		require(
			tokenContract.transfer(_msgSender(), amount),
			"Token transfer failed!"
		);
	}

	/** @dev Function to get all active stakes.
	 * @return Array of Stake objects
	 */
	function getActiveStakes() external view returns (Stake[] memory) {
		return activeStakes;
	}
}
