// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {ShadowBidFactory} from "../src/ShadowBidFactory.sol";
import {ShadowBidVault} from "../src/ShadowBidVault.sol";
import {MockERC20, MockConfidentialToken} from "../src/mocks/MockTokens.sol";

contract ShadowBidTest is Test {
    MockERC20              public usdc;
    MockConfidentialToken  public cToken;
    ShadowBidFactory       public factory;

    address auctioneer = makeAddr("auctioneer");
    address alice      = makeAddr("alice");
    address bob        = makeAddr("bob");
    address carol      = makeAddr("carol");

    uint256 constant RESERVE       = 100e6;  // 100 USDC
    uint256 constant BID_DURATION  = 1 days;
    uint256 constant REVEAL_DURATION = 6 hours;

    function _deployAuction() internal returns (ShadowBidVault vault) {
        vm.prank(auctioneer);
        address v = factory.createAuction(
            "Vintage Rolex",
            "1965 Rolex Submariner, excellent condition",
            RESERVE,
            BID_DURATION,
            REVEAL_DURATION
        );
        vault = ShadowBidVault(v);
    }

    function _commitment(address bidder, uint256 amount, bytes32 salt)
        internal pure returns (bytes32)
    {
        return keccak256(abi.encodePacked(amount, salt, bidder));
    }

    function _fundAndApprove(address user, uint256 amount, address vault) internal {
        usdc.mint(user, amount);
        vm.startPrank(user);
        usdc.approve(address(cToken), amount);
        cToken.wrap(amount);
        cToken.approve(vault, amount);
        vm.stopPrank();
    }

    function setUp() public {
        usdc    = new MockERC20();
        cToken  = new MockConfidentialToken(address(usdc));
        factory = new ShadowBidFactory(address(cToken));
    }

    function test_FactoryDeploysAuction() public {
        ShadowBidVault vault = _deployAuction();
        assertEq(factory.getAuctionCount(), 1);
        assertEq(factory.auctions(0), address(vault));
    }

    function test_FactoryTracksCreator() public {
        _deployAuction();
        address[] memory created = factory.getAuctionsByCreator(auctioneer);
        assertEq(created.length, 1);
    }

    function test_FactoryRejectsShortBidDuration() public {
        vm.prank(auctioneer);
        vm.expectRevert("Bid phase too short");
        factory.createAuction("Item", "Desc", RESERVE, 30 minutes, REVEAL_DURATION);
    }

    function test_AuctionInitialState() public {
        ShadowBidVault vault = _deployAuction();
        assertEq(vault.auctioneer(), auctioneer);
        assertEq(vault.itemName(), "Vintage Rolex");
        assertEq(vault.reservePrice(), RESERVE);
        assertEq(uint8(vault.status()), uint8(ShadowBidVault.Status.OPEN));
        assertEq(vault.winner(), address(0));
    }

    function test_SubmitBid() public {
        ShadowBidVault vault = _deployAuction();
        _fundAndApprove(alice, 200e6, address(vault));

        bytes32 salt = keccak256("alice-secret");
        bytes32 comm = _commitment(alice, 300e6, salt);

        vm.prank(alice);
        vault.submitBid(comm, 300e6);

        assertEq(vault.getBidderCount(), 1);
        assertTrue(vault.hasBid(alice));
        assertEq(cToken.balanceOf(address(vault)), 300e6);
    }

    function test_CannotBidTwice() public {
        ShadowBidVault vault = _deployAuction();
        _fundAndApprove(alice, 200e6, address(vault));

        bytes32 salt = keccak256("alice-secret");
        bytes32 comm = _commitment(alice, 300e6, salt);

        vm.startPrank(alice);
        vault.submitBid(comm, 300e6);
        vm.expectRevert(ShadowBidVault.AlreadyBid.selector);
        vault.submitBid(comm, 300e6);
        vm.stopPrank();
    }

    function test_CannotBidBelowReserve() public {
        ShadowBidVault vault = _deployAuction();
        _fundAndApprove(alice, 200e6, address(vault));

        // forge-lint: disable-next-line(unsafe-typecast)
        bytes32 comm = _commitment(alice, 50e6, bytes32("salt"));
        vm.prank(alice);
        vm.expectRevert(ShadowBidVault.DepositTooLow.selector);
        vault.submitBid(comm, 50e6);
    }

    function test_CannotBidAfterDeadline() public {
        ShadowBidVault vault = _deployAuction();
        _fundAndApprove(alice, 200e6, address(vault));

        skip(BID_DURATION + 1);
        
        // forge-lint: disable-next-line(unsafe-typecast)
        bytes32 comm = _commitment(alice, 300e6, bytes32("salt"));
        vm.prank(alice);
        vm.expectRevert(ShadowBidVault.BidDeadlinePassed.selector);
        vault.submitBid(comm, 300e6);
    }

    function test_OpenRevealPhase() public {
        ShadowBidVault vault = _deployAuction();
        skip(BID_DURATION + 1);
        vault.openRevealPhase();
        assertEq(uint8(vault.status()), uint8(ShadowBidVault.Status.REVEAL));
    }

    function test_CannotOpenRevealBeforeDeadline() public {
        ShadowBidVault vault = _deployAuction();
        vm.expectRevert(ShadowBidVault.BidDeadlineNotPassed.selector);
        vault.openRevealPhase();
    }

    function test_RevealBid() public {
        ShadowBidVault vault = _deployAuction();
        _fundAndApprove(alice, 200e6, address(vault));

        bytes32 salt = keccak256("alice-secret");
        uint256 amount = 300e6;
        bytes32 comm = _commitment(alice, amount, salt);

        vm.prank(alice);
        vault.submitBid(comm, 500e6);

        skip(BID_DURATION + 1);
        vault.openRevealPhase();

        vm.prank(alice);
        vault.revealBid(amount, salt);

        assertTrue(vault.hasRevealed(alice));
        assertEq(vault.winner(), alice);
        assertEq(vault.winningAmount(), amount);
    }

    function test_InvalidRevealRejected() public {
        ShadowBidVault vault = _deployAuction();
        _fundAndApprove(alice, 200e6, address(vault));

        bytes32 salt = keccak256("alice-secret");
        bytes32 comm = _commitment(alice, 300e6, salt);

        vm.prank(alice);
        vault.submitBid(comm, 300e6);

        skip(BID_DURATION + 1);
        vault.openRevealPhase();

        vm.prank(alice);
        vm.expectRevert(ShadowBidVault.InvalidCommitment.selector);
        vault.revealBid(400e6, salt);
    }

    function test_HighestBidWins() public {
        ShadowBidVault vault = _deployAuction();
        _fundAndApprove(alice, 200e6, address(vault));
        _fundAndApprove(bob,   350e6, address(vault));

        bytes32 saltA = keccak256("alice-salt");
        bytes32 saltB = keccak256("bob-salt");

        vm.prank(alice);
        vault.submitBid(_commitment(alice, 200e6, saltA), 200e6);

        vm.prank(bob);
        vault.submitBid(_commitment(bob, 350e6, saltB), 350e6);

        skip(BID_DURATION + 1);
        vault.openRevealPhase();

        vm.prank(alice); vault.revealBid(200e6, saltA);
        vm.prank(bob);   vault.revealBid(350e6, saltB);

        assertEq(vault.winner(), bob);
        assertEq(vault.winningAmount(), 350e6);
    }

    function test_SettleAndRefund() public {
        ShadowBidVault vault = _deployAuction();
        _fundAndApprove(alice, 200e6, address(vault));
        _fundAndApprove(bob,   350e6, address(vault));

        bytes32 saltA = keccak256("alice-salt");
        bytes32 saltB = keccak256("bob-salt");

        vm.prank(alice);
        vault.submitBid(_commitment(alice, 200e6, saltA), 200e6);

        vm.prank(bob);
        vault.submitBid(_commitment(bob, 350e6, saltB), 350e6);

        skip(BID_DURATION + 1);
        vault.openRevealPhase();

        vm.prank(alice); vault.revealBid(200e6, saltA);
        vm.prank(bob);   vault.revealBid(350e6, saltB);

        skip(REVEAL_DURATION + 1);
        vault.settleAuction();

        assertEq(uint8(vault.status()), uint8(ShadowBidVault.Status.SETTLED));

        assertEq(cToken.balanceOf(auctioneer), 350e6);

        vm.prank(alice);
        vault.claimRefund();
        assertEq(cToken.balanceOf(alice), 200e6);
    }

    function test_CannotRefundTwice() public {
        ShadowBidVault vault = _deployAuction();
        _fundAndApprove(alice, 200e6, address(vault));

        bytes32 salt = keccak256("salt");
        vm.prank(alice);
        vault.submitBid(_commitment(alice, 200e6, salt), 200e6);

        skip(BID_DURATION + 1); vault.openRevealPhase();
        vm.prank(alice); vault.revealBid(200e6, salt);
        skip(REVEAL_DURATION + 1);

        _fundAndApprove(bob, 100e6, address(vault));
        vault.settleAuction();

        vm.prank(alice);
        vm.expectRevert(ShadowBidVault.AlreadyRefunded.selector);
        vault.claimRefund();
    }
}
