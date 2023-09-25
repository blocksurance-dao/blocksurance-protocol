// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ApeCoin is ERC20 {
    constructor() ERC20("Ape Coin", "APE") {
        _mint(msg.sender, 10000 * 10 ** decimals());
    }

    function drip(address to) public {
        _mint(to, 1000 * 10 ** decimals());
    }
}
