import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useAuction } from "../hooks/useAuction";
import { STATUS, STATUS_COLOR, fmt, countdown } from "../config/contracts";
import type { WalletState } from "../hooks/useWallet";

interface Props {
  vaultAddress: string;
  wallet: WalletState;
  onBack: () => void;
  onViewSeller: (addr: string) => void;
}

function parseDescription(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return { desc: parsed.desc || raw, image: parsed.image || null, condition: parsed.condition || null };
  } catch {
    return { desc: raw, image: null, condition: null };
  }
}

export default function AuctionDetail({ vaultAddress, wallet, onBack, onViewSeller }: Props) {
  const {
    info, loading, txLoading, error,
    hasBid, hasReveal, storedSalt, storedAmount, usdcBalance,
    mintUsdc, submitBid, openReveal, revealBid, settle, claimRefund,
  } = useAuction(vaultAddress, wallet.signer, wallet.provider, wallet.address);

  const [now,        setNow]       = useState(Math.floor(Date.now() / 1000));
  const [depositAmt, setDepositAmt] = useState("");
  const [revealAmt,  setRevealAmt]  = useState("");
  const [mintAmt,    setMintAmt]    = useState("1000");

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (storedAmount) setRevealAmt(storedAmount);
  }, [storedAmount]);

  if (loading || !info) {
    return (
      <div style={styles.centered}>
        <p style={{ color: "#9ca3af" }}>Loading auction…</p>
      </div>
    );
  }

  const isOpen       = info.status === 0 && now <= info.bidDeadline;
  const canOpenReveal = info.status === 0 && now > info.bidDeadline;
  const isReveal     = info.status === 1 && now <= info.revealDeadline;
  const canSettle    = info.status === 1 && now > info.revealDeadline;
  const isSettled    = info.status === 2;
  const userWon      = isSettled && info.winner.toLowerCase() === wallet.address?.toLowerCase();
  const userLost     = isSettled && hasBid && !userWon;

  return (
    <div style={styles.page}>
      <button style={styles.back} onClick={onBack}>← All Auctions</button>

      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <h1 style={styles.title}>{info.itemName}</h1>
          <span style={{ ...styles.badge, background: STATUS_COLOR[info.status] + "22", color: STATUS_COLOR[info.status] }}>
            {STATUS[info.status]}
          </span>
        </div>
        {(() => {
          const { desc, image, condition } = parseDescription(info.itemDescription);
          return (
            <>
              {image && (
                <img src={image} alt={info.itemName}
                  style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 8, marginBottom: 12 }}
                  onError={e => (e.currentTarget.style.display = "none")} />
              )}
              <p style={styles.desc}>{desc}</p>
              {condition && (
                <span style={styles.conditionBadge}>Condition: {condition}</span>
              )}
            </>
          );
        })()}
        <div style={styles.grid}>
          <div><p style={styles.label}>Reserve</p><p style={styles.value}>{fmt(info.reservePrice)}</p></div>
          <div><p style={styles.label}>Bidders</p><p style={styles.value}>{info.bidderCount}</p></div>
          {isOpen && <div><p style={styles.label}>Bid closes</p><p style={{ ...styles.value, color: "#22c55e" }}>{countdown(info.bidDeadline)}</p></div>}
          {isReveal && <div><p style={styles.label}>Reveal closes</p><p style={{ ...styles.value, color: "#f59e0b" }}>{countdown(info.revealDeadline)}</p></div>}
          {isSettled && info.winner !== ethers.ZeroAddress && (
            <>
              <div><p style={styles.label}>Winner</p><p style={styles.value}>{info.winner.slice(0, 8)}…</p></div>
              <div><p style={styles.label}>Winning bid</p><p style={styles.value}>{fmt(info.winningAmount)}</p></div>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
          <button
            onClick={() => onViewSeller(info.auctioneer)}
            style={{ background: "none", border: "none", color: "#7c3aed", fontSize: 12, cursor: "pointer", padding: 0 }}
          >
            View seller profile →
          </button>
          <a href={`https://sepolia.arbiscan.io/address/${info.auctioneer}`}
            target="_blank" style={{ color: "#6b7280", fontSize: 12 }}>
            Arbiscan ↗
          </a>
        </div>
      </div>

      {userWon && <div style={styles.winnerBanner}>🎉 You won this auction!</div>}

      {error && <div style={styles.errorBox}>{error}</div>}

      {wallet.address && (
        <>
          <div style={styles.card}>
            <p style={styles.label}>Your USDC balance</p>
            <p style={styles.value}>{fmt(usdcBalance)}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input style={styles.input} type="number" placeholder="Amount to mint" value={mintAmt}
                onChange={e => setMintAmt(e.target.value)} />
              <button style={styles.btnSecondary} disabled={txLoading} onClick={() => mintUsdc(ethers.parseUnits(mintAmt, 6))}>
                Mint test USDC
              </button>
            </div>
            <p style={styles.hint}>Mint free testnet USDC to use for bidding</p>
          </div>

          {isOpen && !hasBid && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Place sealed bid</h2>
              <p style={styles.hint}>Your bid amount is hidden. A random salt is saved locally so you can reveal later.</p>
              <input style={{ ...styles.input, marginTop: 12 }} type="number" placeholder={`Bid amount (min ${ethers.formatUnits(info.reservePrice, 6)} USDC)`}
                value={depositAmt} onChange={e => setDepositAmt(e.target.value)} />
              <button style={{ ...styles.btnPrimary, marginTop: 12 }} disabled={txLoading || !depositAmt}
                onClick={() => submitBid(ethers.parseUnits(depositAmt, 6))}>
                {txLoading ? "Submitting…" : "Submit sealed bid"}
              </button>
            </div>
          )}

          {isOpen && hasBid && (
            <div style={styles.infoBanner}>✓ Bid submitted. Return during reveal phase to reveal your amount.</div>
          )}

          {canOpenReveal && (
            <button style={styles.btnAmber} disabled={txLoading} onClick={openReveal}>
              {txLoading ? "Opening…" : "Open reveal phase"}
            </button>
          )}

          {isReveal && hasBid && !hasReveal && storedSalt && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Reveal your bid</h2>
              <p style={styles.hint}>Confirm your bid amount. Your salt was saved when you bid.</p>
              <input style={{ ...styles.input, marginTop: 12 }} type="number" value={revealAmt}
                onChange={e => setRevealAmt(e.target.value)} />
              <button style={{ ...styles.btnAmber, marginTop: 12 }} disabled={txLoading}
                onClick={() => revealBid(ethers.parseUnits(revealAmt, 6), storedSalt)}>
                {txLoading ? "Revealing…" : "Reveal bid"}
              </button>
            </div>
          )}

          {isReveal && hasReveal && (
            <div style={styles.infoBanner}>✓ Bid revealed. Waiting for reveal phase to end…</div>
          )}

          {canSettle && (
            <button style={styles.btnPrimary} disabled={txLoading} onClick={settle}>
              {txLoading ? "Settling…" : "Settle auction"}
            </button>
          )}

          {userLost && (
            <button style={styles.btnSecondary} disabled={txLoading} onClick={claimRefund}>
              {txLoading ? "Claiming…" : "Claim refund"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:        { padding: "32px 24px", maxWidth: 640, margin: "0 auto" },
  centered:    { display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" },
  back:        { background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 14, marginBottom: 24, padding: 0 },
  card:        { background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 24, marginBottom: 16 },
  title:       { fontSize: 22, fontWeight: 700, color: "#f9fafb", margin: 0 },
  cardTitle:   { fontSize: 16, fontWeight: 600, color: "#f9fafb", margin: "0 0 4px" },
  desc:        { color: "#6b7280", fontSize: 14, marginTop: 8, marginBottom: 16 },
  grid:        { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  label:       { fontSize: 12, color: "#6b7280", margin: "0 0 2px" },
  value:       { fontSize: 16, fontWeight: 600, color: "#f9fafb", margin: 0 },
  badge:       { fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" },
  input:       { background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "10px 12px", color: "#f9fafb", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" },
  hint:        { fontSize: 12, color: "#6b7280", marginTop: 6 },
  btnPrimary:  { width: "100%", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnAmber:    { width: "100%", background: "#d97706", color: "#fff", border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnSecondary: { background: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: 8, padding: "10px 16px", fontSize: 14, cursor: "pointer", whiteSpace: "nowrap" },
  winnerBanner: { background: "#14532d", border: "1px solid #16a34a", borderRadius: 12, padding: 16, textAlign: "center", color: "#86efac", fontWeight: 600, marginBottom: 16 },
  infoBanner:  { background: "#1f2937", border: "1px solid #374151", borderRadius: 12, padding: 16, color: "#9ca3af", fontSize: 14, marginBottom: 16 },
  errorBox:    { background: "#450a0a", border: "1px solid #dc2626", borderRadius: 8, padding: "12px 16px", color: "#f87171", fontSize: 13, marginBottom: 16 },
  conditionBadge: { display: "inline-block", background: "#1f2937", border: "1px solid #374151", borderRadius: 6, padding: "3px 10px", fontSize: 12, color: "#9ca3af", marginBottom: 16 },
};