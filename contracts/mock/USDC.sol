// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./ERC20Mock.sol";

//mumbai deployed at 0x346D9a8512b773658d1EA10eA19819B17c7361a7
contract USDC is ERC20Mock("USD Coin", "USDC") {
    constructor() {
        // _mint(msg.sender, 2000 * 10 ** decimals());
    }

    function drip(address to) public {
        _mint(to, 20000 * 10 ** decimals());
    }

    function mint(address to, uint amount) public {
        _mint(to, amount * 10 ** decimals());
    }
}
