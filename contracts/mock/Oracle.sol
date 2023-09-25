// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

// mumbai deployed to 0xF0dd2Ac0Eb3F1b0754313ED25eAb0D3423862954

contract PriceConsumerV3 {
    /**
     * Network: Polygon Mumbai
     * Aggregator: LINK/USDC
     * Address: 0x12162c3E810393dEC01362aBf156D7ecf6159528 LINK/USD
     * Address: 0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada USDC/USD
     */
    constructor() {}

    /**
     * Returns the latest price
     */
    function getStablePrice() public view returns (uint256) {
        uint256 _price1 = getLatestPrice(0x12162c3E810393dEC01362aBf156D7ecf6159528);
        uint256 _price2 = getLatestPrice(0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada);
        return _price1 / _price2;
    }

    function getLatestPrice(address feed) public view returns (uint256) {
        require(feed != address(0), "Invalid feed");
        (, int256 price, , , ) = AggregatorV3Interface(feed).latestRoundData();
        return uint256(price);
    }
}
