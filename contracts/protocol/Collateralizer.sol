// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "hardhat/console.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

struct Position {
    uint256 positionId;
    uint256 amount;
    uint256 creation;
    uint256 expiration;
    uint8 yield;
}

contract Collateralizer is AccessControl {
    using SafeMath for uint256;
    IERC20 immutable baseContract;

    mapping(uint => Position) public collateral;
    Position[] public liquidationQue;
    uint public que;
    uint8 public yield = 4;
    address public routerAddress;
    bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");
    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");

    event Deposit(uint amount, uint time, uint8 yield, address pool);
    event Liquidate(address sender, uint positionId, uint time);
    event ProcessQue(uint amount, uint time);
    event TransferIn(uint amount, uint time);
    event TransferOut(address sender, uint amount, uint time);

    constructor(address usdc) {
        baseContract = IERC20(usdc);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    receive() external payable {
        if (msg.value > 0) revert();
    }

    modifier authorized() {
        require(hasRole(ROUTER_ROLE, msg.sender) || hasRole(LIQUIDATOR_ROLE, msg.sender));
        _;
    }

    function setRouter(address router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(routerAddress == address(0x0));
        require(router != address(0x0));
        routerAddress = router;
    }

    function setYield(uint8 yieldPercent) external onlyRole(DEFAULT_ADMIN_ROLE) {
        yield = yieldPercent;
    }

    function getCollateral(uint positionId) external view returns (uint) {
        return collateral[positionId].amount;
    }

    function deposit(
        uint positionId,
        uint amount,
        uint expiraton,
        address pool
    ) external onlyRole(ROUTER_ROLE) {
        collateral[positionId] = Position(positionId, amount, block.timestamp, expiraton, yield);
        emit Deposit(amount, block.timestamp, yield, pool);
    }

    function processQue() external onlyRole(LIQUIDATOR_ROLE) {
        require(baseContract.balanceOf(address(this)) >= que, "Insufficient balance!");
        uint amount = que;
        delete que;
        delete liquidationQue;
        emit ProcessQue(amount, block.timestamp);
        require(baseContract.transfer(routerAddress, amount), "processQue failed");
    }

    function calculateYield(uint positionId) public view returns (uint) {
        Position storage pos = collateral[positionId];
        uint lifespan = block.timestamp - pos.creation;
        require(lifespan > 1 days, "Position lifespan error");

        uint durationClock = block.timestamp < pos.expiration
            ? lifespan
            : pos.expiration - pos.creation;
        return pos.amount.mul(pos.yield).mul(durationClock).div(100).div(365).div(1 days);
    }

    function liquidatePosition(uint positionId) external authorized {
        Position storage pos = collateral[positionId];
        uint reward = calculateYield(positionId);
        que += pos.amount + reward;
        liquidationQue.push(collateral[positionId]);
        delete collateral[positionId];
        emit Liquidate(msg.sender, positionId, block.timestamp);
    }

    function transferOut(address to, uint256 amount) external onlyRole(LIQUIDATOR_ROLE) {
        require(to != address(0x0));
        emit TransferOut(msg.sender, amount, block.timestamp);
        require(baseContract.transfer(to, amount), "TransferOut failed");
    }

    function transferIn(uint256 amount) external onlyRole(LIQUIDATOR_ROLE) {
        emit TransferIn(amount, block.timestamp);
        require(baseContract.transferFrom(msg.sender, address(this), amount), "TransferIn failed!");
    }
}
