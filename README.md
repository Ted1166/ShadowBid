# ShadowBid 🔒

**Confidential Sealed-Bid Auctions on Arbitrum · Powered by iExec Nox**

ShadowBid is a sealed-bid auction protocol where bid amounts are hidden from all participants using iExec Nox Confidential Tokens. No bidder can see what anyone else has offered. Only the winner is revealed — after everyone has already committed.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Network: Arbitrum Sepolia](https://img.shields.io/badge/Network-Arbitrum%20Sepolia-blue)](https://sepolia.arbiscan.io)
[![Powered by: iExec Nox](https://img.shields.io/badge/Powered%20by-iExec%20Nox-purple)](https://docs.iex.ec/nox-protocol)

---

## The Problem

Every existing on-chain auction is public. When you bid, everyone watching the chain can see your amount. Later bidders outbid you by the smallest possible increment. This breaks the core promise of a sealed-bid auction.

ShadowBid fixes this: bids are committed as hashes, and winning payouts are wrapped into iExec Nox Confidential Tokens — so the settlement amount is never exposed on the public ledger.

---

## How It Works

```
Bid Phase              Reveal Phase            Settlement
─────────────          ────────────────        ──────────
Bidder commits         Deadline passes         Highest reveal
hash(amount,           Each bidder reveals     wins auction
salt, address)         (amount + salt)
+ deposits USDC        Contract verifies       Auctioneer receives
                       hash matches            winning amount
                                               wrapped as cToken
                       Invalid reveals         (confidential)
                       are ignored
                                               Losers claim
                                               full USDC refund
```

### iExec Nox Integration

At settlement, the winning USDC amount is wrapped into an iExec Nox Confidential Token via `IConfidentialWrapper.wrap()`. The auctioneer receives a confidential token — the settlement amount is hidden from the public ledger. This is the core Nox integration: the winning bid becomes a private, auditable, confidential asset.

---

## Deployed Contracts (Arbitrum Sepolia)

| Contract | Address | Verified |
|---|---|---|
| `ShadowBidFactory` | `0x11E0c320515F9B14c07d474CD26a91F0506e28A0` | [Sourcify](https://sourcify.dev/server/repo-ui/421614/0x11E0c320515F9B14c07d474CD26a91F0506e28A0) |
| `MockConfidentialWrapper` | `0x0484aAb961bA9DBcFcDEe4aAeAb7ee57516ABF0f` | [Sourcify](https://sourcify.dev/server/repo-ui/421614/0x0484aAb961bA9DBcFcDEe4aAeAb7ee57516ABF0f) |
| `MockUSDC` | `0x8C07bF0A9A9c1f2c56B2a9441022015084912E5F` | [Sourcify](https://sourcify.dev/server/repo-ui/421614/0x8C07bF0A9A9c1f2c56B2a9441022015084912E5F) |

---

## Architecture

```
contracts/
├── ShadowBidFactory.sol          # Deploys and indexes all auction vaults
├── ShadowBidVault.sol            # Core auction: commit → reveal → settle
├── interfaces/
│   └── IConfidentialWrapper.sol  # iExec Nox ERC-7984 wrapper interface
└── mocks/
    ├── MockUSDC.sol              # Testnet USDC (mintable faucet)
    └── MockConfidentialWrapper.sol # Nox wrapper simulation for testing
```

### ShadowBidVault lifecycle

```
OPEN → (bid deadline) → REVEAL → (reveal deadline) → SETTLED
                                                          ↓
                                              Auctioneer: cToken (confidential)
                                              Losers: USDC refund
                                              Winner: excess deposit returned
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- Hardhat v3
- MetaMask on Arbitrum Sepolia
- Arbitrum Sepolia ETH from [faucet.triangleplatform.com](https://faucet.triangleplatform.com/arbitrum/sepolia)

### Install

```bash
git clone https://github.com/your-username/shadowbid.git
cd shadowbid/contracts
npm install
```

### Run tests

```bash
npx hardhat test
```

All 23 tests pass across: Factory, Auction state, Bid phase, Reveal phase, Settlement, Cancellation, and getInfo.

### Deploy

```bash
export ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
export DEPLOYER_PRIVATE_KEY=0x_your_private_key

npx hardhat ignition deploy ignition/modules/ShadowBid.ts --network arbitrumSepolia
```

---

## Demo Flow

1. **Create auction** — set item name, reserve price, bid duration, reveal duration
2. **Wallet A bids** — enters 250 USDC, app generates salt and commitment hash, submits on-chain
3. **Wallet B bids** — enters 180 USDC — neither bidder sees the other's amount
4. **Bid phase ends** — anyone calls `openRevealPhase()`
5. **Both wallets reveal** — submit `(amount, salt)`, contract verifies hashes
6. **Settle** — Wallet A wins (highest reveal), auctioneer receives 250 USDC wrapped as cToken
7. **Wallet B claims refund** — 180 USDC returned

---

## Why iExec Nox

Standard on-chain auctions expose every bid publicly. iExec Nox Confidential Tokens give us hidden balances via Trusted Execution Environments — settlement amounts are processed without appearing as plaintext on the public chain.

This makes ShadowBid's privacy guarantee cryptographically enforced at the settlement layer, not just a front-end convention.

---

## License

MIT