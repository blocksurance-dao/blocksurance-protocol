// SPDX-License-Identifier: GPL-v3.0
pragma solidity ^0.8.18;

import "./InsuredPool.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

struct Token {
    string name;
    string symbol;
    address tokenAddress;
    address oracleUSDC;
    string imageURL;
}

struct Pool {
    uint256 created;
    address tokenAddress;
    address oracleAddress;
    uint64 premium;
    uint64 minPositionDuration;
    string imageURL;
    string symbol;
    string currency;
}

contract FACTORY is AccessControl {
    using EnumerableSet for EnumerableSet.AddressSet;
    EnumerableSet.AddressSet internal tokenList;

    mapping(address => Token) internal tokens;
    mapping(address => Pool) public pool;
    mapping(address => address[]) public pools;
    mapping(address => bool) public isPool;
    mapping(address => bool) public paused;

    uint256 public counter = 0;
    address public coverNFT;
    address public liquidityRouter;
    address private usdc;
    // address public blocksurance;
    uint256 public maxPoolSize = 1_000_000 * 10 ** 6;
    uint256 public poolReward = 5 * 10 ** 18;
    bytes32 public constant POOL_ROLE = keccak256("POOL_ROLE");
    bytes32 public constant LISTER_ROLE = keccak256("LISTER_ROLE");

    event Initialize(address usdc, address coverNFT, address positionNFT);
    event ParamsUpdate(uint256 reward, uint256 maxLiquidity);
    event ListToken(address _address, uint256 time);
    event DelistToken(address _address, uint256 time);
    event PoolDeployed(address poolAddress, address oracle);
    event PoolRewarded(address poolAddress, uint256 amount);
    event PoolPaused(address poolAddress);
    event PoolUnpaused(address poolAddress);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(POOL_ROLE, msg.sender);
        _grantRole(LISTER_ROLE, msg.sender);
    }

    function initialize(
        address usdcAddress,
        address coverAddress,
        address routerAddress
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        usdc = usdcAddress;

        coverNFT = coverAddress;
        liquidityRouter = routerAddress;
        emit Initialize(usdc, coverNFT, liquidityRouter);
    }

    function setParams(uint256 reward, uint256 maxLiquidity) public onlyRole(DEFAULT_ADMIN_ROLE) {
        poolReward = reward;
        maxPoolSize = maxLiquidity;
        emit ParamsUpdate(reward, maxLiquidity);
    }

    function getToken(address token) public view returns (Token memory) {
        return tokens[token];
    }

    function getTokenUrl(address token) public view returns (string memory) {
        return tokens[token].imageURL;
    }

    function getListings() public view returns (address[] memory array) {
        array = tokenList.values();
    }

    function isListed(address token) public view returns (bool) {
        return tokenList.contains(token);
    }

    function tokenListLength() public view returns (uint) {
        return tokenList.length();
    }

    function listToken(
        string calldata name,
        string calldata symbol,
        address token,
        address oracleUSDC,
        string calldata imageURL
    ) external onlyRole(LISTER_ROLE) {
        // Add token address to listed tokens
        require(tokenList.contains(token) != true, "Token Exists!");

        Token storage item = tokens[token];
        item.name = name;
        item.symbol = symbol;
        item.tokenAddress = token;
        item.oracleUSDC = oracleUSDC;
        item.imageURL = imageURL;
        require(tokenList.add(token));

        emit ListToken(token, block.timestamp);
    }

    function removeToken(address token) public onlyRole(LISTER_ROLE) {
        require(tokenList.contains(token), "Not listed!");
        delete tokens[token];
        require(tokenList.remove(token));
        emit DelistToken(token, block.timestamp);
    }

    function createPool(
        address token,
        address base,
        uint64 premium,
        uint64 minPositionDuration
    ) public onlyRole(POOL_ROLE) returns (address) {
        address oracle = tokens[token].oracleUSDC;
        require(tokenList.contains(token) == true, "Unlisted token!");
        require(base == usdc, "Invalid base!");
        require(premium > 9 && premium < 991, "Invalid premium!");

        address poolAddr = address(
            new InsurancePool(
                oracle, //oracle
                token, //token
                base, //usdc
                address(this), //factory
                coverNFT,
                liquidityRouter,
                premium,
                minPositionDuration
            )
        );

        counter++;
        isPool[poolAddr] = true;
        pools[token].push(poolAddr);
        string memory baseSymbol = IERC20Metadata(base).symbol();
        Token memory tokenObj = tokens[token];
        pool[poolAddr] = Pool(
            block.timestamp,
            token,
            oracle,
            premium,
            minPositionDuration,
            tokenObj.imageURL,
            tokenObj.symbol,
            baseSymbol
        );
        emit PoolDeployed(poolAddr, oracle);
        return poolAddr;
    }

    function getPools(address token) public view returns (address[] memory) {
        return pools[token];
    }

    function getPool(address poolAddress) public view returns (Pool memory) {
        return pool[poolAddress];
    }

    function pausePool(address poolAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(isPool[poolAddress] == true);
        paused[poolAddress] = true;
        emit PoolPaused(poolAddress);
    }

    function activatePool(address poolAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        paused[poolAddress] = false;
        emit PoolUnpaused(poolAddress);
    }

    function transferOut(
        address token,
        address to,
        uint256 amount
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20 tokenContract = IERC20(token);
        require(tokenContract.transfer(to, amount), "transfer failed!");
    }
}
