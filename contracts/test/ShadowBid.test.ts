/// <reference types="@nomicfoundation/hardhat-toolbox-mocha-ethers" />
import { expect } from "chai";
import { ethers } from "ethers";
import hre from "hardhat";

const RESERVE         = ethers.parseUnits("100", 6);
const BID_DURATION    = 24 * 3600;
const REVEAL_DURATION = 6 * 3600;

function makeCommitment(amount: bigint, s: string, bidder: string): string {
  return ethers.solidityPackedKeccak256(
    ["uint256", "bytes32", "address"],
    [amount, s, bidder]
  );
}

function makeSalt(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

describe("ShadowBid", function () {
  let usdc:    any;
  let wrapper: any;
  let factory: any;
  let signers: any[];
  let ethers:  any;
  let provider: any;

  beforeEach(async function () {
    const conn = await hre.network.create();
    ethers   = conn.ethers;
    provider = conn.provider;

    signers = await ethers.getSigners();
    usdc    = await ethers.deployContract("MockUSDC");
    wrapper = await ethers.deployContract("MockConfidentialWrapper", [await usdc.getAddress()]);
    factory = await ethers.deployContract("ShadowBidFactory", [
        await usdc.getAddress(),
        await wrapper.getAddress(),
    ]);
  });

  async function deployAuction(hreEthers: any, auctioneer: any) {
    const tx = await factory.connect(auctioneer).createAuction(
      "Vintage Rolex",
      "1965 Rolex Submariner",
      RESERVE,
      BID_DURATION,
      REVEAL_DURATION
    );
    const receipt = await tx.wait();
    const event = receipt?.logs
      .map((log: any) => {
        try { return factory.interface.parseLog(log); } catch { return null; }
      })
      .find((e: any) => e?.name === "AuctionCreated");
    const vaultAddress = event?.args?.vault as string;
    return hreEthers.getContractAt("ShadowBidVault", vaultAddress);
  }

  async function fundAndApprove(user: any, amount: bigint, vault: any) {
    await usdc.mint(user.address, amount);
    await usdc.connect(user).approve(await vault.getAddress(), 999_999_999n * 10n ** 6n);
  }

  async function increaseTime(seconds: number) {
    await provider.request({ method: "evm_increaseTime", params: [seconds] });
    await provider.request({ method: "evm_mine", params: [] });
  }

  describe("Factory", function () {
    it("deploys an auction and tracks it", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      expect(await factory.getAuctionCount()).to.equal(1n);
      expect(await factory.auctions(0)).to.equal(await vault.getAddress());
    });

    it("tracks auctions by creator", async function () {
      await deployAuction(ethers, signers[1]);
      const created = await factory.getAuctionsByCreator(signers[1].address);
      expect(created.length).to.equal(1);
    });

    it("rejects bid duration below 1 hour", async function () {
      await expect(
        factory.connect(signers[1]).createAuction("X", "Y", RESERVE, 1800, REVEAL_DURATION)
      ).to.be.revertedWith("Bid phase too short");
    });

    it("rejects empty item name", async function () {
      await expect(
        factory.connect(signers[1]).createAuction("", "Y", RESERVE, BID_DURATION, REVEAL_DURATION)
      ).to.be.revertedWith("Item name required");
    });
  });

  describe("Auction initial state", function () {
    it("sets correct initial values", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      expect(await vault.auctioneer()).to.equal(signers[1].address);
      expect(await vault.itemName()).to.equal("Vintage Rolex");
      expect(await vault.reservePrice()).to.equal(RESERVE);
      expect(await vault.status()).to.equal(0);
      expect(await vault.winner()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Bid phase", function () {
    it("accepts a valid bid", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      const alice = signers[2];
      await fundAndApprove(alice, ethers.parseUnits("300", 6), vault);

      const s = makeSalt();
      const c = makeCommitment(ethers.parseUnits("300", 6), s, alice.address);
      await vault.connect(alice).submitBid(c, ethers.parseUnits("300", 6));

      expect(await vault.getBidderCount()).to.equal(1n);
      expect(await vault.hasBid(alice.address)).to.be.true;
    });

    it("rejects a second bid from same address", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      const alice = signers[2];
      await fundAndApprove(alice, ethers.parseUnits("600", 6), vault);

      const s = makeSalt();
      const c = makeCommitment(ethers.parseUnits("300", 6), s, alice.address);
      await vault.connect(alice).submitBid(c, ethers.parseUnits("300", 6));

      await expect(
        vault.connect(alice).submitBid(c, ethers.parseUnits("300", 6))
      ).to.be.revertedWithCustomError(vault, "AlreadyBid");
    });

    it("rejects deposit below reserve price", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      const alice = signers[2];
      await fundAndApprove(alice, ethers.parseUnits("50", 6), vault);

      const s = makeSalt();
      const c = makeCommitment(ethers.parseUnits("50", 6), s, alice.address);
      await expect(
        vault.connect(alice).submitBid(c, ethers.parseUnits("50", 6))
      ).to.be.revertedWithCustomError(vault, "DepositTooLow");
    });

    it("rejects bid after deadline", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      const alice = signers[2];
      await fundAndApprove(alice, ethers.parseUnits("300", 6), vault);
      await increaseTime(BID_DURATION + 1);

      const s = makeSalt();
      const c = makeCommitment(ethers.parseUnits("300", 6), s, alice.address);
      await expect(
        vault.connect(alice).submitBid(c, ethers.parseUnits("300", 6))
      ).to.be.revertedWithCustomError(vault, "BidDeadlinePassed");
    });
  });

  describe("Reveal phase transition", function () {
    it("opens reveal phase after bid deadline", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      await increaseTime(BID_DURATION + 1);
      await vault.openRevealPhase();
      expect(await vault.status()).to.equal(1);
    });

    it("rejects opening reveal before deadline", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      await expect(vault.openRevealPhase()).to.be.revertedWithCustomError(vault, "BidDeadlineNotPassed");
    });
  });

  describe("Reveal phase", function () {
    it("accepts a valid reveal", async function () {
      const vault  = await deployAuction(ethers, signers[1]);
      const alice  = signers[2];
      const amount = ethers.parseUnits("300", 6);
      await fundAndApprove(alice, amount, vault);

      const s = makeSalt();
      await vault.connect(alice).submitBid(makeCommitment(amount, s, alice.address), amount);
      await increaseTime(BID_DURATION + 1);
      await vault.openRevealPhase();
      await vault.connect(alice).revealBid(amount, s);

      expect(await vault.hasRevealed(alice.address)).to.be.true;
      expect(await vault.winner()).to.equal(alice.address);
      expect(await vault.winningAmount()).to.equal(amount);
    });

    it("rejects invalid reveal (wrong amount)", async function () {
      const vault  = await deployAuction(ethers, signers[1]);
      const alice  = signers[2];
      const amount = ethers.parseUnits("300", 6);
      await fundAndApprove(alice, amount, vault);

      const s = makeSalt();
      await vault.connect(alice).submitBid(makeCommitment(amount, s, alice.address), amount);
      await increaseTime(BID_DURATION + 1);
      await vault.openRevealPhase();

      await expect(
        vault.connect(alice).revealBid(ethers.parseUnits("400", 6), s)
      ).to.be.revertedWithCustomError(vault, "InvalidCommitment");
    });

    it("rejects invalid reveal (wrong salt)", async function () {
      const vault  = await deployAuction(ethers, signers[1]);
      const alice  = signers[2];
      const amount = ethers.parseUnits("300", 6);
      await fundAndApprove(alice, amount, vault);

      const s = makeSalt();
      await vault.connect(alice).submitBid(makeCommitment(amount, s, alice.address), amount);
      await increaseTime(BID_DURATION + 1);
      await vault.openRevealPhase();

      await expect(
        vault.connect(alice).revealBid(amount, makeSalt())
      ).to.be.revertedWithCustomError(vault, "InvalidCommitment");
    });

    it("selects the highest revealed bid as winner", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      const alice = signers[2];
      const bob   = signers[3];
      const amtA  = ethers.parseUnits("200", 6);
      const amtB  = ethers.parseUnits("350", 6);

      await fundAndApprove(alice, amtA, vault);
      await fundAndApprove(bob,   amtB, vault);

      const sA = makeSalt();
      const sB = makeSalt();
      await vault.connect(alice).submitBid(makeCommitment(amtA, sA, alice.address), amtA);
      await vault.connect(bob).submitBid(makeCommitment(amtB, sB, bob.address), amtB);

      await increaseTime(BID_DURATION + 1);
      await vault.openRevealPhase();
      await vault.connect(alice).revealBid(amtA, sA);
      await vault.connect(bob).revealBid(amtB, sB);

      expect(await vault.winner()).to.equal(bob.address);
      expect(await vault.winningAmount()).to.equal(amtB);
    });
  });

  describe("Settlement", function () {
    it("settles: auctioneer receives confidential tokens, loser gets USDC refund", async function () {
      const auctioneer = signers[1];
      const alice      = signers[2];
      const bob        = signers[3];
      const vault      = await deployAuction(ethers, auctioneer);
      const amtA       = ethers.parseUnits("200", 6);
      const amtB       = ethers.parseUnits("350", 6);

      await fundAndApprove(alice, amtA, vault);
      await fundAndApprove(bob,   amtB, vault);

      const sA = makeSalt();
      const sB = makeSalt();
      await vault.connect(alice).submitBid(makeCommitment(amtA, sA, alice.address), amtA);
      await vault.connect(bob).submitBid(makeCommitment(amtB, sB, bob.address), amtB);

      await increaseTime(BID_DURATION + 1);
      await vault.openRevealPhase();
      await vault.connect(alice).revealBid(amtA, sA);
      await vault.connect(bob).revealBid(amtB, sB);
      await increaseTime(REVEAL_DURATION + 1);
      await vault.settleAuction();

      expect(await vault.status()).to.equal(2);
      expect(await wrapper.confidentialBalanceOf(auctioneer.address)).to.equal(amtB);

      await vault.connect(alice).claimRefund();
      expect(await usdc.balanceOf(alice.address)).to.equal(amtA);
    });

    it("winner receives excess deposit back in USDC", async function () {
      const vault   = await deployAuction(ethers, signers[1]);
      const bob     = signers[3];
      const deposit = ethers.parseUnits("500", 6);
      const bidAmt  = ethers.parseUnits("350", 6);

      await fundAndApprove(bob, deposit, vault);
      const s = makeSalt();
      await vault.connect(bob).submitBid(makeCommitment(bidAmt, s, bob.address), deposit);

      await increaseTime(BID_DURATION + 1);
      await vault.openRevealPhase();
      await vault.connect(bob).revealBid(bidAmt, s);
      await increaseTime(REVEAL_DURATION + 1);
      await vault.settleAuction();

      expect(await usdc.balanceOf(bob.address)).to.equal(deposit - bidAmt);
    });

    it("cannot refund twice", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      const alice  = signers[2];
      const bob    = signers[3];
      const amtA   = ethers.parseUnits("200", 6);
      const amtB   = ethers.parseUnits("350", 6);

      await fundAndApprove(alice, amtA, vault);
      await fundAndApprove(bob,   amtB, vault);

      const sA = makeSalt();
      const sB = makeSalt();
      await vault.connect(alice).submitBid(makeCommitment(amtA, sA, alice.address), amtA);
      await vault.connect(bob).submitBid(makeCommitment(amtB, sB, bob.address), amtB);

      await increaseTime(BID_DURATION + 1);
      await vault.openRevealPhase();
      await vault.connect(alice).revealBid(amtA, sA);
      await vault.connect(bob).revealBid(amtB, sB);
      await increaseTime(REVEAL_DURATION + 1);
      await vault.settleAuction();

      await vault.connect(alice).claimRefund();
      await expect(
        vault.connect(alice).claimRefund()
      ).to.be.revertedWithCustomError(vault, "AlreadyRefunded");
    });

    it("cannot settle before reveal deadline", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      const alice  = signers[2];
      const amt    = ethers.parseUnits("200", 6);

      await fundAndApprove(alice, amt, vault);
      const s = makeSalt();
      await vault.connect(alice).submitBid(makeCommitment(amt, s, alice.address), amt);

      await increaseTime(BID_DURATION + 1);
      await vault.openRevealPhase();
      await vault.connect(alice).revealBid(amt, s);

      await expect(vault.settleAuction()).to.be.revertedWithCustomError(vault, "RevealDeadlineNotPassed");
    });
  });

  describe("Cancellation", function () {
    it("auctioneer can cancel auction with no bids", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      await vault.connect(signers[1]).cancel();
      expect(await vault.status()).to.equal(3);
    });

    it("cannot cancel if bids exist", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      const alice  = signers[2];
      const amt    = ethers.parseUnits("200", 6);

      await fundAndApprove(alice, amt, vault);
      const s = makeSalt();
      await vault.connect(alice).submitBid(makeCommitment(amt, s, alice.address), amt);

      await expect(
        vault.connect(signers[1]).cancel()
      ).to.be.revertedWithCustomError(vault, "BidDeadlinePassed");
    });

    it("non-auctioneer cannot cancel", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      await expect(
        vault.connect(signers[2]).cancel()
      ).to.be.revertedWithCustomError(vault, "NotAuctioneer");
    });
  });

  describe("getInfo", function () {
    it("returns correct auction metadata", async function () {
      const vault = await deployAuction(ethers, signers[1]);
      const info  = await vault.getInfo();
      expect(info._auctioneer).to.equal(signers[1].address);
      expect(info._itemName).to.equal("Vintage Rolex");
      expect(info._reservePrice).to.equal(RESERVE);
      expect(info._bidderCount).to.equal(0n);
    });
  });
});