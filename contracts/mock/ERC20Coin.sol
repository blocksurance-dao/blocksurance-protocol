// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract ERC20Coin is ERC20, Initializable, AccessControl {
    uint256 private immutable maxAirdrop;
    uint256 public totalAirDrop;
    uint256 public lastBurn;
    uint256 public lastTransfer;
    uint256 public immutable initialSupply;
    uint256 private immutable interval = 60 days;
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant REWARDER_ROLE = keccak256("REWARDER_ROLE");

    event Burn(uint256 amount);
    event Reward(address to, uint amount);
    event AirDrop(address winner, uint256 amount);

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        uint256 supply
    ) ERC20(tokenName, tokenSymbol) {
        initialSupply = supply * 1e18;
        maxAirdrop = (supply * 1e18 * 14) / 100;
        _mint(address(this), supply * 1e18);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function initialize(address timelock) external initializer onlyRole(DEFAULT_ADMIN_ROLE) {
        _setupRole(BURNER_ROLE, timelock);
        // _grantRole(BURNER_ROLE, msg.sender);
        // _grantRole(MINTER_ROLE, msg.sender);
    }

    receive() external payable {
        if (msg.value > 0) revert();
    }

    function burn(uint256 amount) external onlyRole(BURNER_ROLE) {
        require(amount <= initialSupply / 50, "Burn too large!");
        require(block.timestamp - lastBurn > interval, "Interval violation!");
        lastBurn = block.timestamp;
        emit Burn(amount);
        _burn(address(this), amount);
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
}
