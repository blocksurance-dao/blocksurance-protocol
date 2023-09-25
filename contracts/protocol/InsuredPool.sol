// SPDX-License-Identifier: GPL-v3.0
pragma solidity ^0.8.18;

import "hardhat/console.sol";
import "./IFactory.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AutomationCompatibleInterface.sol";

interface IERC721Cover {
    function mintCoverage(
        uint256 coverageAmount,
        uint8 decimals,
        uint256 expirationTimestamp,
        string calldata currency,
        string calldata symbol,
        string calldata imageURL,
        uint256 strikePrice,
        uint8 oracleDecimals
    ) external returns (uint);

    function burnNFT(uint256 tokenId) external;

    function ownerOf(uint256 tokenId) external view returns (address owner);
}

interface IOracle {
    function getStablePrice() external view returns (uint256);
}

interface ILiquidityRouter {
    function routeLiquidity(address to, uint amount) external;

    function updateLiquidity(uint amount, uint tokenId) external;

    function getQuote(
        address pool,
        uint256 coverAmount,
        uint256 strikePercent
    ) external returns (uint);

    function transactionAMM(
        address pool,
        uint256 amount,
        uint256 expiration,
        uint256 commission
    ) external returns (uint);

    function liquidatePosition(uint256 positionId) external;
}

struct Coverage {
    uint256 tokenId;
    uint256 amount;
    uint256 strike;
    uint256 expiration;
    uint256 counterPartyId;
    bool claim;
}

contract InsurancePool is AccessControl, AutomationCompatibleInterface {
    using SafeMath for uint256;

    mapping(uint => Coverage) public coverage;
    uint[] public tokenIds;

    string public name;
    uint256 public immutable interval = 14400; //4 hours
    uint256 public lastTimeStamp;
    uint256 public latestPrice;
    bool public claimEvent = false;
    address public immutable oracle;
    address public immutable liquidityRouter;
    uint256 public maxPoolSize;

    uint64 public premium;
    uint64 public immutable minPositionDuration;
    uint8 public constant oracleDecimals = 8; // LINK/USD price feed oracle decimals

    IERC20Metadata private immutable baseContract;
    IERC20Metadata private immutable tokenContract;
    IFactory private immutable factoryContract;
    IERC721Cover private immutable coverNFT;
    ILiquidityRouter private immutable routerContract;

    string private currency;
    string public symbol;
    string private imageURI;

    uint256 nextStrike;
    uint256 nextExpiration;
    uint256 public constant maxCapacity = 800;
    bytes32 public constant RISK_MANAGER_ROLE = keccak256("RISK_MANAGER_ROLE");

    constructor(
        address oracleAddr, // LINK/USDC Oracle address
        address tokenAddr, // LINK address
        address baseAddr, // USDC address
        address factoryAddr,
        address coverErc721,
        address liquidityAddr,
        uint64 premium_,
        uint64 minPositionDuration_
    ) {
        oracle = oracleAddr;
        latestPrice = getLatestPrice();
        tokenContract = IERC20Metadata(tokenAddr); //link
        baseContract = IERC20Metadata(baseAddr); //usdc
        name = string(
            abi.encodePacked(tokenContract.symbol(), "/", baseContract.symbol(), " Insurance Pool")
        );
        factoryContract = IFactory(factoryAddr);
        liquidityRouter = liquidityAddr;
        routerContract = ILiquidityRouter(liquidityAddr);
        // oracleDecimals = AggregatorV3Interface(oracle).decimals();

        coverNFT = IERC721Cover(coverErc721);
        premium = premium_;
        currency = baseContract.symbol();
        symbol = tokenContract.symbol();
        imageURI = factoryContract.getTokenUrl(tokenAddr);
        maxPoolSize = factoryContract.maxPoolSize();
        minPositionDuration = minPositionDuration_;
        _grantRole(DEFAULT_ADMIN_ROLE, tx.origin);
    }

    modifier poolValid() {
        require(claimEvent == false, "Claim triggered!");
        _;
    }

    modifier notPaused() {
        require(factoryContract.paused(msg.sender) == false);
        _;
    }

    receive() external payable {
        if (msg.value > 0) revert();
    }

    function setPremium(uint64 premium_) external onlyRole(RISK_MANAGER_ROLE) {
        premium = premium_;
    }

    function getLatestPrice() public view returns (uint256) {
        // IOracle _oracle = IOracle(oracle);
        // return _oracle.getStablePrice();
        return 797000000;
    }

    function buyCoverage(
        uint256 coverageAmount,
        uint256 strikePercent
    ) external poolValid notPaused returns (uint256) {
        maxPoolSize = factoryContract.maxPoolSize();
        require(coverageAmount >= maxPoolSize / maxCapacity / 2, "Amount too small!");
        require(tokenIds.length < maxCapacity, "Pool at capacity!");
        require(strikePercent >= 10 && strikePercent <= 40, "Invalid strike!");
        latestPrice = getLatestPrice();
        uint256 _strikePrice = latestPrice.mul(strikePercent).div(100);
        uint256 _expirationTimestamp = block.timestamp.add((1 days * 3650) / strikePercent);
        uint256 _premium = routerContract.getQuote(address(this), coverageAmount, strikePercent);

        uint256 _counterPartyId = routerContract.transactionAMM(
            address(this),
            coverageAmount,
            _expirationTimestamp,
            _premium
        );
        require(_counterPartyId > 0, "AMM: NO MATCH");

        uint256 tokenId = coverNFT.mintCoverage(
            coverageAmount,
            baseContract.decimals(),
            _expirationTimestamp,
            currency,
            symbol,
            imageURI,
            _strikePrice,
            oracleDecimals
        );

        Coverage storage cover = coverage[tokenId];
        cover.tokenId = tokenId;
        cover.amount = coverageAmount;
        cover.strike = _strikePrice;
        cover.expiration = _expirationTimestamp;
        cover.counterPartyId = _counterPartyId;
        cover.claim = false;
        tokenIds.push(tokenId);

        if (_strikePrice > nextStrike) nextStrike = _strikePrice;
        if (_expirationTimestamp < nextExpiration || nextExpiration == 0)
            nextExpiration = _expirationTimestamp;

        emit BuyCoverage(address(this), coverageAmount);
        require(
            baseContract.transferFrom(msg.sender, liquidityRouter, _premium),
            "TransferIn failed!"
        );
        return tokenId;
    }

    event BuyCoverage(address pool, uint amount);

    function checkUpkeep(
        bytes calldata /* checkData */
    ) external view override returns (bool upkeepNeeded, bytes memory performData) {
        upkeepNeeded = block.timestamp.sub(lastTimeStamp) > interval;
        performData = "0x00";
    }

    event PerformUpkeep(uint256 time, uint256 claims);

    function performUpkeep(bytes calldata /* performData */) external override {
        if (block.timestamp.sub(lastTimeStamp) >= interval && tokenIds.length != 0) {
            uint _nextStrike = 0;
            uint _time = block.timestamp;
            uint256 _nextExpiration = _time + 365 days;
            uint _latestPrice = getLatestPrice() / 10; //**!**//
            latestPrice = _latestPrice;
            lastTimeStamp = _time;

            if (_latestPrice <= nextStrike) {
                for (uint256 i = 0; i < tokenIds.length; ) {
                    uint tokenId = tokenIds[i];

                    Coverage storage item = coverage[tokenId];
                    uint256 _amount = item.amount;
                    if (item.claim == true) continue;
                    if (_latestPrice <= item.strike) {
                        item.claim = true;
                        tokenIds[i] = tokenIds[tokenIds.length - 1];
                        tokenIds.pop();
                    } else if (block.timestamp >= item.expiration) {
                        tokenIds[i] = tokenIds[tokenIds.length - 1];
                        tokenIds.pop();
                        routerContract.updateLiquidity(_amount, item.counterPartyId);
                    } else {
                        if (item.strike > _nextStrike) {
                            _nextStrike = item.strike;
                        }
                        if (item.expiration < _nextExpiration) {
                            _nextExpiration = item.expiration;
                        }
                        ++i;
                    }
                }

                nextExpiration = _nextExpiration;
                nextStrike = _nextStrike;
            } else if (_time >= nextExpiration) {
                resolveExpirations();
            }
        }
    }

    function resolveClaims() external {
        /// @title ResolveExpirations
        /// @author Blocksurance Dev Team
        /// @notice fallback in case someone want to trigger claims manually
        /// @dev mark items with current claim
        uint _nextStrike = 0;
        uint256 _nextExpiration = block.timestamp + 365 days;
        uint256 _latestPrice = getLatestPrice() / 10;

        for (uint256 i = 0; i < tokenIds.length; ) {
            uint tokenId = tokenIds[i];
            Coverage storage item = coverage[tokenId];

            if (_latestPrice <= item.strike) {
                item.claim = true;
                tokenIds[i] = tokenIds[tokenIds.length - 1];
                tokenIds.pop();
            } else {
                if (item.strike > _nextStrike) {
                    _nextStrike = item.strike;
                }
                if (item.expiration < _nextExpiration) {
                    _nextExpiration = item.expiration;
                }
                ++i;
            }
        }

        nextExpiration = _nextExpiration;
        nextStrike = _nextStrike;
    }

    function resolveClaim(uint tokenId) public {
        address to = coverNFT.ownerOf(tokenId);
        Coverage memory item = coverage[tokenId];
        require(item.claim, "Claim event did not occur!");
        if (!claimEvent) claimEvent = true;
        delete coverage[tokenId];
        emit ClaimPaid(to, item.amount, block.timestamp);
        coverNFT.burnNFT(tokenId);
        routerContract.liquidatePosition(item.counterPartyId);
        routerContract.routeLiquidity(to, item.amount);
    }

    event ClaimPaid(address to, uint256 amount, uint256 time);

    function resolveExpirations() public {
        /// @title ResolveExpirations
        /// @author Blocksurance Dev Team
        /// @notice fallback in case someone want to trigger expirations manually
        /// @dev delete expired covers and resolve balances

        uint _time = block.timestamp;
        uint256 _nextExpiration = _time + 365 days;

        for (uint256 i = 0; i < tokenIds.length; ) {
            uint tokenId = tokenIds[i];

            Coverage storage item = coverage[tokenId];

            if (_time >= item.expiration) {
                tokenIds[i] = tokenIds[tokenIds.length - 1];
                tokenIds.pop();
                routerContract.updateLiquidity(item.amount, item.counterPartyId);
            } else if (item.expiration < _nextExpiration && item.expiration > _time) {
                _nextExpiration = item.expiration;
                ++i;
            } else {
                ++i;
            }
        }

        nextExpiration = _nextExpiration;
    }
}
