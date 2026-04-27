// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IConfidentialWrapper} from "./interfaces/IConfidentialWrapper.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract ShadowBidVault {
    enum Status { OPEN, REVEAL, SETTLED, CANCELLED }

    struct Bid {
        bytes32 commitment;
        uint256 deposit;
        uint256 revealedAmount;
        bool revealed;
        bool refunded;
    }

    address public immutable FACTORY;
    IERC20 public immutable USDC;
    IConfidentialWrapper public immutable C_WRAPPER;

    address public auctioneer;
    string public itemName;
    string public itemDescription;
    uint256 public reservePrice;
    uint256 public bidDeadline;
    uint256 public revealDeadline;

    Status public status;
    address public winner;
    uint256 public winningAmount;

    address[] public bidders;
    mapping(address => Bid) public bids;

    event BidSubmitted(address indexed bidder, uint256 deposit);
    event BidRevealed(address indexed bidder, uint256 amount);
    event AuctionSettled(address indexed winner, uint256 amount);
    event Refunded(address indexed bidder, uint256 amount);
    event AuctionCancelled();

    error AuctionNotOpen();
    error AuctionNotInReveal();
    error AuctionNotSettled();
    error BidDeadlinePassed();
    error BidDeadlineNotPassed();
    error RevealDeadlineNotPassed();
    error RevealDeadlinePassed();
    error AlreadyBid();
    error AlreadyRevealed();
    error AlreadyRefunded();
    error InvalidCommitment();
    error DepositTooLow();
    error NotBidder();
    error NotAuctioneer();
    error TransferFailed();

    modifier onlyAuctioneer() {
        _onlyAuctioneer();
        _;
    }

    function _onlyAuctioneer() internal view {
        if (msg.sender != auctioneer) revert NotAuctioneer();
    }

    modifier onlyStatus(Status s) {
        _onlyStatus(s);
        _;
    }

    function _onlyStatus(Status s) internal view {
        if (status != s) {
            if (s == Status.OPEN)   revert AuctionNotOpen();
            if (s == Status.REVEAL) revert AuctionNotInReveal();
            revert AuctionNotSettled();
        }
    }

    constructor(
        address _auctioneer,
        address _usdc,
        address _cWrapper,
        string memory _itemName,
        string memory _itemDescription,
        uint256 _reservePrice,
        uint256 _bidDuration,
        uint256 _revealDuration
    ) {
        FACTORY        = msg.sender;
        auctioneer     = _auctioneer;
        USDC           = IERC20(_usdc);
        C_WRAPPER      = IConfidentialWrapper(_cWrapper);
        itemName       = _itemName;
        itemDescription = _itemDescription;
        reservePrice   = _reservePrice;
        bidDeadline    = block.timestamp + _bidDuration;
        revealDeadline = bidDeadline + _revealDuration;
        status         = Status.OPEN;
    }

    function submitBid(bytes32 commitment, uint256 deposit)
        external
        onlyStatus(Status.OPEN)
    {
        if (block.timestamp > bidDeadline)    revert BidDeadlinePassed();
        if (bids[msg.sender].commitment != 0) revert AlreadyBid();
        if (deposit < reservePrice)           revert DepositTooLow();

        bids[msg.sender] = Bid({
            commitment:     commitment,
            deposit:        deposit,
            revealedAmount: 0,
            revealed:       false,
            refunded:       false
        });
        bidders.push(msg.sender);

        if (!USDC.transferFrom(msg.sender, address(this), deposit)) revert TransferFailed();

        emit BidSubmitted(msg.sender, deposit);
    }

    function openRevealPhase() external onlyStatus(Status.OPEN) {
        if (block.timestamp <= bidDeadline) revert BidDeadlineNotPassed();
        status = Status.REVEAL;
    }

    function revealBid(uint256 amount, bytes32 salt)
        external
        onlyStatus(Status.REVEAL)
    {
        if (block.timestamp > revealDeadline) revert RevealDeadlinePassed();

        Bid storage bid = bids[msg.sender];
        if (bid.commitment == 0) revert NotBidder();
        if (bid.revealed)        revert AlreadyRevealed();

        bytes32 expected = keccak256(abi.encodePacked(amount, salt, msg.sender));
        if (expected != bid.commitment) revert InvalidCommitment();

        bid.revealed       = true;
        bid.revealedAmount = amount;

        if (amount > winningAmount && amount >= reservePrice) {
            winningAmount = amount;
            winner        = msg.sender;
        }

        emit BidRevealed(msg.sender, amount);
    }

    function settleAuction() external {
        if (status != Status.REVEAL)           revert AuctionNotInReveal();
        if (block.timestamp <= revealDeadline) revert RevealDeadlineNotPassed();

        status = Status.SETTLED;

        if (winner != address(0)) {
            if (!USDC.approve(address(C_WRAPPER), winningAmount)) revert TransferFailed();
            C_WRAPPER.wrap(auctioneer, winningAmount);

            uint256 excess = bids[winner].deposit - winningAmount;
            if (excess > 0) {
                bids[winner].refunded = true;
                if (!USDC.transfer(winner, excess)) revert TransferFailed();
            }
        }

        emit AuctionSettled(winner, winningAmount);
    }

    function claimRefund() external {
        if (status != Status.SETTLED) revert AuctionNotSettled();

        Bid storage bid = bids[msg.sender];
        if (bid.commitment == 0) revert NotBidder();
        if (bid.refunded)        revert AlreadyRefunded();
        if (msg.sender == winner) revert AlreadyRefunded();

        bid.refunded = true;
        if (!USDC.transfer(msg.sender, bid.deposit)) revert TransferFailed();

        emit Refunded(msg.sender, bid.deposit);
    }

    function cancel() external onlyAuctioneer onlyStatus(Status.OPEN) {
        if (bidders.length > 0) revert BidDeadlinePassed();
        status = Status.CANCELLED;
        emit AuctionCancelled();
    }

    function getBidderCount() external view returns (uint256) {
        return bidders.length;
    }

    function getBidders() external view returns (address[] memory) {
        return bidders;
    }

    function hasBid(address bidder) external view returns (bool) {
        return bids[bidder].commitment != 0;
    }

    function hasRevealed(address bidder) external view returns (bool) {
        return bids[bidder].revealed;
    }

    function getInfo() external view returns (
        address _auctioneer,
        string memory _itemName,
        string memory _itemDescription,
        uint256 _reservePrice,
        uint256 _bidDeadline,
        uint256 _revealDeadline,
        Status  _status,
        uint256 _bidderCount,
        address _winner,
        uint256 _winningAmount
    ) {
        return (
            auctioneer,
            itemName,
            itemDescription,
            reservePrice,
            bidDeadline,
            revealDeadline,
            status,
            bidders.length,
            winner,
            winningAmount
        );
    }
}
