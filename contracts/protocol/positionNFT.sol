// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "./IFactory.sol";
import { Base64 } from "./base64.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract PositionManager is ERC721, ERC721Enumerable, ERC721URIStorage, ERC2981, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIdCounter;

    address public factory;
    mapping(uint256 => address) tokenIdToPool;

    constructor() ERC721("BLOCKSURANCE", "LPYT") {
        _setDefaultRoyalty(address(this), 25);
    }

    modifier onlyRouter() {
        require(IFactory(factory).liquidityRouter() == msg.sender);
        _;
    }

    receive() external payable {}

    function withdraw(uint256 amount) public onlyOwner {
        (bool success, ) = msg.sender.call{ value: amount }("");
        require(success, "WD Fail");
    }

    event SetFactory(address sender, uint time);

    function setFactory(address factoryAddr) public onlyOwner {
        factory = factoryAddr;
        emit SetFactory(msg.sender, block.timestamp);
    }

    function mintPosition(
        uint256 positionAmount,
        uint8 decimals,
        uint256 expirationTimestamp,
        string calldata currency,
        string calldata symbolName,
        string calldata imageURL
    ) external onlyRouter returns (uint256 tokenId) {
        string memory amount = Base64.getStringPrice(positionAmount, decimals);
        string memory expiration = Base64.timestampToDate(expirationTimestamp);

        string memory attributes = string(
            abi.encodePacked(
                '[{"trait_type": "Currency", "value": "',
                currency,
                '"}, {"trait_type": "Amount", "value": "',
                amount,
                '"}, {"trait_type": "Expiration", "value": "',
                expiration,
                '"}, {"trait_type": "Asset", "value": "',
                symbolName,
                '"}]'
            )
        );

        string memory positionName = Base64.concat(symbolName, " Underwriter Position");
        string memory description = Base64.concat(
            "Pool address ",
            Base64.addressToString(abi.encodePacked(msg.sender))
        );

        string memory _tokenURI = Base64.formatTokenURI(
            positionName,
            description,
            attributes,
            imageURL
        );

        tokenId = safeMint(_tokenURI);
    }

    event MintPosition(uint256 _tokenId, address _pool, address _owner, uint time);

    function safeMint(string memory tokenUri) internal returns (uint tokenId) {
        tokenId = _tokenIdCounter.current() + 1;
        _tokenIdCounter.increment();

        tokenIdToPool[tokenId] = msg.sender;
        emit MintPosition(tokenId, msg.sender, tx.origin, block.timestamp);
        _safeMint(tx.origin, tokenId);
        _setTokenURI(tokenId, tokenUri);
    }

    event BurnPosition(address sender, uint time);

    function burnNFT(uint256 tokenId) external onlyRouter {
        _burn(tokenId);
        emit BurnPosition(msg.sender, block.timestamp);
    }

    function currentId() public view returns (uint256) {
        return _tokenIdCounter.current();
    }

    //////////////////////////////////////////////////////////////////
    // The following functions are overrides required by Solidity.
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
        _resetTokenRoyalty(tokenId);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable, ERC721URIStorage, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
