// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Vesting {
    // Vesting contract with 12 month cliff, 36 month vesting
    uint public immutable cliff;
    uint256 public constant interval = 30 days;
    uint public immutable supply;
    uint256 public lastTransfer;

    IERC20 immutable tokenContract;
    address payable public immutable owner;

    event Vested(uint amount, uint when);

    constructor(address govToken, address owner_, uint amount) {
        require(owner_ != address(0x0));
        owner = payable(owner_);
        supply = amount;
        tokenContract = IERC20(govToken);
        cliff = block.timestamp + 365 days;
        lastTransfer = cliff;
    }

    function withdraw() public {
        require(block.timestamp >= cliff, "You can't withdraw yet");
        require(msg.sender == owner, "You aren't the owner");
        require(block.timestamp - lastTransfer > interval, "Interval violation!");
        lastTransfer = block.timestamp;

        emit Vested(supply / 24, block.timestamp);
        require(tokenContract.transfer(owner, supply / 24), "Transfer failed!");
    }
}
