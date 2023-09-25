// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

contract GovernanceToken is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PermitUpgradeable,
    ERC20VotesUpgradeable,
    AccessControlUpgradeable
{
    /// @custom:oz-upgrades-unsafe-allow constructor
    // constructor() {
    //     _disableInitializers();
    // }

    function initialize() public initializer {
        __ERC20_init("BLOCKSURANCE", "BLK");
        __ERC20Burnable_init();
        __ERC20Permit_init("BLOCKSURANCE");
        __ERC20Votes_init();
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        initialSupply = 5_000_000_000 * 1e18;
        maxAirdrop = (initialSupply * 14) / 100;
        _mint(address(this), initialSupply);
    }

    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    EnumerableSetUpgradeable.AddressSet internal stakeSet;

    uint256 private maxAirdrop;
    uint256 public totalAirDrop;

    uint256 public lastTransfer;
    uint256 public initialSupply;
    uint256 private immutable interval = 60 days;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant REWARDER_ROLE = keccak256("REWARDER_ROLE");

    mapping(address => Stake) internal stakes;
    uint8[] private _rates = [8, 10, 12];

    uint256 public totalStaked;
    uint256 public currentStaked;
    bool private paused = false;
    uint64 public constant MIN_STAKING_PERIOD = 90; //days
    uint64 public maxStakingPeriod = 450; //days
    uint256 private minimalStake = 10_000_000 ether; //~$100000 worth

    struct Stake {
        address userAddress;
        uint256 amount;
        uint64 duration;
        uint256 expiration;
        uint8 rate;
    }

    event Reward(address to, uint amount);
    event AirDrop(address winner, uint256 amount);
    event Staked(address staker, uint256 amount, uint256 time);
    event ExitStake(address contributor, uint256 amount, uint256 time);

    modifier isStakeable(uint64 durationInDays) {
        require(durationInDays >= MIN_STAKING_PERIOD, "Min staking period is 90 days!");
        require(durationInDays <= maxStakingPeriod, "Max staking period exceeded!");
        require(stakes[msg.sender].amount == 0, "You already have a Stake!");
        _;
    }

    receive() external payable {
        if (msg.value > 0) revert();
    }

    function setMinStake(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minimalStake = amount;
    }

    function getMinStake() external view returns (uint256) {
        return minimalStake;
    }

    function setMaxStakingPeriod(uint64 numDays) external onlyRole(DEFAULT_ADMIN_ROLE) {
        maxStakingPeriod = numDays;
    }

    function _getAPR(uint64 numDays) internal view returns (uint8) {
        if (numDays > 364) {
            return _rates[2]; // high
        } else if (numDays > 179) {
            return _rates[1]; // mid
        } else {
            return _rates[0]; // low
        }
    }

    function stakingEnabled(bool value) public onlyRole(DEFAULT_ADMIN_ROLE) {
        paused = !value;
    }

    function setRates(uint8 low, uint8 mid, uint8 high) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _rates = [low, mid, high];
    }

    function getRates() public view returns (uint8[] memory) {
        return _rates;
    }

    function getActiveStakers() external view returns (address[] memory array) {
        require(stakeSet.length() <= 2000, "Array too big!");
        array = stakeSet.values();
    }

    function getUserStake(address userAddress) external view returns (Stake memory item) {
        item = stakes[userAddress];
    }

    function stakeTokens(
        uint256 tokenAmount,
        uint64 durationInDays
    ) external isStakeable(durationInDays) {
        require(paused == false, "Staking is temporarily halted!");
        require(tokenAmount >= minimalStake, "Amount less than minimal stake!");

        require(balanceOf(msg.sender) >= tokenAmount, "You don't have enough tokens!");

        uint256 stakeUntil = block.timestamp + (durationInDays * (1 days));
        totalStaked = totalStaked + tokenAmount;
        currentStaked = currentStaked + tokenAmount;

        uint8 rate = _getAPR(durationInDays);
        require(stakeSet.add(msg.sender));
        stakes[msg.sender] = Stake(msg.sender, tokenAmount, durationInDays, stakeUntil, rate);

        _burn(msg.sender, tokenAmount);
        emit Staked(msg.sender, tokenAmount, block.timestamp);
    }

    function exitStake(address userAddress) public {
        require(block.timestamp >= stakes[msg.sender].expiration, "Lockup period not over!");
        uint256 amount = stakes[userAddress].amount;
        require(amount > 0, "You don't have a stake!");

        uint256 rewardAmount = ((amount * stakes[userAddress].duration * stakes[userAddress].rate) /
            36500);

        delete stakes[userAddress];
        currentStaked = currentStaked - amount;

        require(stakeSet.remove(userAddress));

        _mint(userAddress, amount);
        emit ExitStake(userAddress, amount, block.timestamp);

        require(transfer(userAddress, rewardAmount) == true, "Failed to complete reward!");
    }

    function transferOut(address to, uint256 amount) external onlyRole(MINTER_ROLE) returns (bool) {
        require(amount <= initialSupply / 50, "Transfer too large!");
        require(block.timestamp - lastTransfer > interval, "Interval violation!");
        lastTransfer = block.timestamp;
        _transfer(address(this), to, amount);
        return true;
    }

    function reward(address to, uint256 amount) external onlyRole(REWARDER_ROLE) returns (bool) {
        require(amount <= initialSupply / 1000, "Reward too large!");
        emit Reward(to, amount);
        _transfer(address(this), to, amount);
        return true;
    }

    function airdrop(
        address[] calldata addresses,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(totalAirDrop < maxAirdrop, "Airdrop limit reached!");
        require(addresses.length * amount <= maxAirdrop, "Amount greater than limit!");
        totalAirDrop += addresses.length * amount;
        for (uint8 i; i < addresses.length; i++) {
            _transfer(address(this), addresses[i], amount);
            emit AirDrop(addresses[i], amount);
        }
    }

    // The following functions are overrides required by Solidity.

    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
        super._afterTokenTransfer(from, to, amount);
    }

    function _mint(
        address to,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
        super._mint(to, amount);
    }

    function _burn(
        address account,
        uint256 amount
    ) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
        super._burn(account, amount);
    }
}
