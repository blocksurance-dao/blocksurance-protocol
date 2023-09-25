// SPDX-License-Identifier: GPL-v3.0
pragma solidity ^0.8.18;

import "hardhat/console.sol";
import "./IFactory.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

struct Position {
    uint256 tokenId;
    uint256 amount;
    uint256 freeAmount;
    uint256 creation;
    uint256 expiration;
    uint256 commision;
    uint8 yield;
    address pool;
    bool liquidated;
}

interface IPoolContract {
    function claimEvent() external view returns (bool);

    function symbol() external view returns (string memory);

    function premium() external view returns (uint64);

    function minPositionDuration() external view returns (uint64);
}

interface IERC721Position {
    function mintPosition(
        uint256 positionAmount,
        uint8 decimals,
        uint256 expirationTimestamp,
        string calldata currency,
        string calldata symbol,
        string calldata imageURL
    ) external returns (uint);

    function burnNFT(uint256 tokenId) external;

    function ownerOf(uint256 tokenId) external view returns (address owner);
}

interface ICollateralizer {
    function deposit(uint tokenId, uint amount, uint duration, address pool) external;

    function liquidatePosition(uint256 positionId) external;

    function yield() external view returns (uint8);

    function calculateYield(uint positionId) external view returns (uint);
}

contract LIQUIDROUTER {
    using SafeMath for uint256;

    IERC20Metadata immutable baseContract;
    IFactory immutable factoryContract;
    IERC721Position immutable positionNFTContract;
    ICollateralizer immutable collateralizerContract;

    bytes32 public constant POOL_ROLE = keccak256("POOL_ROLE");
    bytes32 public constant LISTER_ROLE = keccak256("LISTER_ROLE");

    mapping(uint => Position) internal position;
    mapping(address => uint[]) public positions;
    mapping(address => uint) public freeLiquidity;
    mapping(address => uint) public totalCoverage;
    mapping(address => uint) public commision;
    uint public positionCount;

    constructor(address factory, address usdc, address posNFT, address collaterilizer) {
        baseContract = IERC20Metadata(usdc);
        factoryContract = IFactory(factory);
        positionNFTContract = IERC721Position(posNFT);
        collateralizerContract = ICollateralizer(collaterilizer);
    }

    modifier onlyPool() {
        require(factoryContract.isPool(msg.sender));
        _;
    }

    modifier validLiquidator(uint tokenId) {
        require(
            factoryContract.isPool(msg.sender) || positionNFTContract.ownerOf(tokenId) == msg.sender
        );
        _;
    }

    receive() external payable {
        if (msg.value > 0) revert();
    }

    function createPosition(
        address pool,
        uint256 amount,
        uint64 durationDays
    ) external returns (uint256) {
        NewPool memory myPool = factoryContract.getPool(pool);
        require(durationDays >= myPool.minPositionDuration, "Duration to small!");
        uint maxPoolSize = factoryContract.maxPoolSize();
        require(amount >= maxPoolSize.div(50), "Position too small!");
        uint256 poolSize = freeLiquidity[pool] + totalCoverage[pool] + amount;
        require(poolSize <= maxPoolSize, "Pool soldout!");

        uint256 debited = amount.mul(99).div(100); //1% pool fee deducted on entry
        freeLiquidity[pool] = freeLiquidity[pool].add(debited);

        uint256 expirationTimestamp = block.timestamp.add(1 days * durationDays);

        uint _tokenId = positionNFTContract.mintPosition(
            amount,
            baseContract.decimals(),
            expirationTimestamp,
            myPool.currency,
            myPool.symbol,
            myPool.imageURL
        );

        Position storage pos = position[_tokenId];
        pos.tokenId = _tokenId;
        pos.amount = debited;
        pos.freeAmount = debited;
        pos.creation = block.timestamp;
        pos.expiration = expirationTimestamp;
        pos.commision = 0;
        pos.yield = collateralizerContract.yield();
        pos.pool = pool;

        positions[pool].push(_tokenId);
        positionCount++;

        collateralizerContract.deposit(_tokenId, (amount * 94) / 100, expirationTimestamp, pool);
        transferIn(amount);
        transferOut(address(factoryContract), amount.sub(debited));
        transferOut(address(collateralizerContract), (amount * 94) / 100);

        emit CreatePosition(_tokenId, msg.sender, debited, block.timestamp);
        return _tokenId;
    }

    event CreatePosition(uint tokenId, address sender, uint amount, uint time);
    event RemovePosition(uint tokenId, address sender, uint amount, uint time);

    function removePosition(uint tokenId) external {
        address to = positionNFTContract.ownerOf(tokenId);
        Position storage pos = position[tokenId];
        uint256 amount = pos.freeAmount;
        uint256 _expiration = pos.expiration;

        require(block.timestamp >= _expiration.add(14400 * 3), "Position active!");
        commision[pos.pool] -= pos.commision;
        if (!pos.liquidated) liquidatePosition(tokenId);
        uint256 _fairShare = amount + pos.commision;

        require(freeLiquidity[pos.pool] >= amount, "Error removing position!");
        freeLiquidity[pos.pool] = freeLiquidity[pos.pool].sub(amount);

        uint len = positions[pos.pool].length;
        for (uint256 i = 0; i < len; i++) {
            if (positions[pos.pool][i] == tokenId) {
                positions[pos.pool][i] = positions[pos.pool][len - 1];
                positions[pos.pool].pop();
                break;
            }
        }

        delete position[tokenId];
        positionCount--;
        positionNFTContract.burnNFT(tokenId);

        emit RemovePosition(tokenId, to, _fairShare, block.timestamp);

        if (_fairShare > 0) {
            transferOut(to, _fairShare);
        }
    }

    function transactionAMM(
        address pool,
        uint256 amount,
        uint256 expiration,
        uint256 commision_
    ) external onlyPool returns (uint) {
        uint len = positions[pool].length;
        for (uint256 i = 0; i < len; i++) {
            uint tokenId = positions[pool][i];
            Position storage pos = position[tokenId];
            if (pos.freeAmount >= amount && expiration <= pos.expiration) {
                pos.freeAmount = pos.freeAmount.sub(amount);
                pos.commision = pos.commision.add(commision_);
                freeLiquidity[msg.sender] -= amount;
                totalCoverage[msg.sender] += amount;
                commision[msg.sender] += commision_;
                return tokenId;
            }
        }
        return 0;
    }

    function getFreeLiquidity(address pool, uint256 expiration) public view returns (uint s) {
        uint len = positions[pool].length;
        for (uint256 i = 0; i < len; i++) {
            uint tokenId = positions[pool][i];
            Position storage pos = position[tokenId];
            if (pos.freeAmount > 0 && expiration <= pos.expiration) {
                s += pos.freeAmount;
            }
        }
    }

    function getQuote(
        address pool,
        uint256 coverAmount,
        uint256 strikePercent
    ) public view returns (uint256) {
        uint256 _expirationTimestamp = block.timestamp.add((1 days * 3650) / strikePercent);
        uint256 freeLiquidityAtExpiration = getFreeLiquidity(pool, _expirationTimestamp);
        require(freeLiquidityAtExpiration >= coverAmount, "No liquidity!");
        require(strikePercent >= 10 && strikePercent <= 40, "Invalid strike!");
        uint64 premium = IPoolContract(pool).premium();
        return coverAmount.mul(premium).div(1000);
    }

    function updateLiquidity(uint amount, uint tokenId) external onlyPool {
        freeLiquidity[msg.sender] += amount;
        totalCoverage[msg.sender] -= amount;
        Position storage pos = position[tokenId];
        pos.freeAmount = pos.freeAmount.add(amount);
    }

    function routeLiquidity(address to, uint amount) external onlyPool {
        totalCoverage[msg.sender] -= amount;
        require(baseContract.transfer(to, amount), "routeLiquidity failed!");
    }

    function calculateYield(uint positionId) public view returns (uint) {
        Position storage pos = position[positionId];
        uint lifespan = block.timestamp - pos.creation;
        require(lifespan > 1 days, "Position lifespan error");

        uint durationClock = block.timestamp < pos.expiration
            ? lifespan
            : pos.expiration - pos.creation;

        uint amount = pos.amount.mul(94).div(99);
        return amount.mul(pos.yield).mul(durationClock).div(100).div(365).div(1 days);
    }

    function liquidatePosition(uint tokenId) public validLiquidator(tokenId) {
        /// @title liquidatePosition
        /// @author Blocksurance Dev Team
        /// @notice triggered by pool in an event of a claim
        /// @dev adds the yield amount to commision
        Position storage pos = position[tokenId];
        if (!pos.liquidated) {
            uint reward = calculateYield(tokenId);
            pos.commision += reward;
            pos.liquidated = true;
            collateralizerContract.liquidatePosition(tokenId);
        }
    }

    function getPosition(uint tokenId) public view returns (Position memory pos) {
        return position[tokenId];
    }

    function poolPositionCount(address pool) public view returns (uint count) {
        return positions[pool].length;
    }

    function transferOut(address to, uint256 amount) internal {
        require(to != address(0x0));
        require(baseContract.transfer(to, amount), "TransferOut failed");
    }

    function transferIn(uint256 amount) internal {
        require(baseContract.transferFrom(msg.sender, address(this), amount), "TransferIn failed!");
    }
}
