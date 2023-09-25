// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

struct NewPool {
    uint256 created;
    address tokenAddress;
    address oracleAddress;
    uint64 premium;
    uint64 minPositionDuration;
    string imageURL;
    string symbol;
    string currency;
}

interface IFactory {
    function getTokenUrl(address tokenAddress) external view returns (string memory);

    function poolReward() external view returns (uint);

    function rewardPool(uint256 amount) external;

    function maxPoolSize() external view returns (uint);

    function pausePool(address poolAddress) external;

    function paused(address poolAddress) external view returns (bool);

    function isPool(address poolAddress) external view returns (bool);

    function isListed(address tokenAddress) external view returns (bool);

    function blocksurance() external view returns (address);

    function tokenListLength() external view returns (uint);

    function liquidityRouter() external view returns (address);

    function getPool(address poolAddress) external view returns (NewPool memory);
}
