import { ethers } from "ethers";

export const CHAIN_ID = 421614;

export const ADDRESSES = {
  factory: "0x11E0c320515F9B14c07d474CD26a91F0506e28A0",
  usdc:    "0x8C07bF0A9A9c1f2c56B2a9441022015084912E5F",
  wrapper: "0x0484aAb961bA9DBcFcDEe4aAeAb7ee57516ABF0f",
};

export const FACTORY_ABI = [
  "function createAuction(string itemName, string itemDescription, uint256 reservePrice, uint256 bidDuration, uint256 revealDuration) external returns (address)",
  "function getAuctionCount() external view returns (uint256)",
  "function getAllAuctions() external view returns (address[])",
  "function getAuctionsByCreator(address creator) external view returns (address[])",
  "event AuctionCreated(address indexed vault, address indexed auctioneer, string itemName, uint256 reservePrice, uint256 bidDeadline)",
];

export const VAULT_ABI = [
  "function getInfo() external view returns (address auctioneer, string itemName, string itemDescription, uint256 reservePrice, uint256 bidDeadline, uint256 revealDeadline, uint8 status, uint256 bidderCount, address winner, uint256 winningAmount)",
  "function submitBid(bytes32 commitment, uint256 deposit) external",
  "function openRevealPhase() external",
  "function revealBid(uint256 amount, bytes32 salt) external",
  "function settleAuction() external",
  "function claimRefund() external",
  "function cancel() external",
  "function hasBid(address bidder) external view returns (bool)",
  "function hasRevealed(address bidder) external view returns (bool)",
  "function getBidderCount() external view returns (uint256)",
  "function status() external view returns (uint8)",
  "function winner() external view returns (address)",
  "function winningAmount() external view returns (uint256)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function mint(address to, uint256 amount) external",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

export const WRAPPER_ABI = [
  "function confidentialBalanceOf(address account) external view returns (uint256)",
];

export const STATUS: Record<number, string> = {
  0: "Bidding Open",
  1: "Reveal Phase",
  2: "Settled",
  3: "Cancelled",
};

export const STATUS_COLOR: Record<number, string> = {
  0: "#22c55e",
  1: "#f59e0b",
  2: "#3b82f6",
  3: "#6b7280",
};

export function makeCommitment(amount: bigint, salt: string, bidder: string): string {
  return ethers.solidityPackedKeccak256(
    ["uint256", "bytes32", "address"],
    [amount, salt, bidder]
  );
}

export function makeSalt(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

export function fmt(wei: bigint | undefined, decimals = 6): string {
  if (wei === undefined) return "—";
  return ethers.formatUnits(wei, decimals) + " USDC";
}

export function countdown(ts: number): string {
  const diff = ts - Math.floor(Date.now() / 1000);
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${h}h ${m}m ${s}s`;
}

export const SALT_KEY = (vault: string, address: string) =>
  `shadowbid:${vault}:${address}`;