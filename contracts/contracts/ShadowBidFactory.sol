// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ShadowBidVault} from "./ShadowBidVault.sol";

contract ShadowBidFactory {
    address public immutable USDC;
    address public immutable C_WRAPPER;

    address[] public auctions;
    mapping(address => address[]) public auctionsByCreator;

    event AuctionCreated(
        address indexed vault,
        address indexed auctioneer,
        string  itemName,
        uint256 reservePrice,
        uint256 bidDeadline
    );

    constructor(address _usdc, address _cWrapper) {
        USDC      = _usdc;
        C_WRAPPER = _cWrapper;
    }

    function createAuction(
        string  calldata itemName,
        string  calldata itemDescription,
        uint256 reservePrice,
        uint256 bidDuration,
        uint256 revealDuration
    ) external returns (address vault) {
        require(bytes(itemName).length > 0,   "Item name required");
        require(reservePrice > 0,             "Reserve price required");
        require(bidDuration >= 1 hours,       "Bid phase too short");
        require(revealDuration >= 30 minutes, "Reveal phase too short");

        vault = address(new ShadowBidVault(
            msg.sender,
            USDC,
            C_WRAPPER,
            itemName,
            itemDescription,
            reservePrice,
            bidDuration,
            revealDuration
        ));

        auctions.push(vault);
        auctionsByCreator[msg.sender].push(vault);

        emit AuctionCreated(
            vault,
            msg.sender,
            itemName,
            reservePrice,
            block.timestamp + bidDuration
        );
    }

    function getAuctionCount() external view returns (uint256) {
        return auctions.length;
    }

    function getAllAuctions() external view returns (address[] memory) {
        return auctions;
    }

    function getAuctionsByCreator(address creator) external view returns (address[] memory) {
        return auctionsByCreator[creator];
    }

    function getAuctions(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        uint256 total = auctions.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = auctions[i];
        }
    }
}
