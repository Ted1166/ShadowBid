import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { ADDRESSES, FACTORY_ABI, STATUS, STATUS_COLOR, fmt } from "../config/contracts";
import type { WalletState } from "../hooks/useWallet";

interface Props {
  sellerAddress: string;
  wallet: WalletState;
  onSelectAuction: (addr: string) => void;
  onBack: () => void;
}

interface AuctionSummary {
  address: string;
  itemName: string;
  reservePrice: bigint;
  status: number;
  bidderCount: number;
  winningAmount: bigint;
  bidDeadline: number;
}

export default function SellerProfile({ sellerAddress, wallet, onSelectAuction, onBack }: Props) {
  const [auctions,  setAuctions]  = useState<AuctionSummary[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [completed, setCompleted] = useState(0);
  const [totalVol,  setTotalVol]  = useState(0n);

  useEffect(() => {
    if (!wallet.provider) return;
    const load = async () => {
      setLoading(true);
      try {
        const factory = new ethers.Contract(ADDRESSES.factory, FACTORY_ABI, wallet.provider!);
        const addrs: string[] = await factory.getAuctionsByCreator(sellerAddress);

        const vaultAbi = [
          "function getInfo() external view returns (address, string, string, uint256, uint256, uint256, uint8, uint256, address, uint256)",
        ];

        const results = await Promise.all(
          addrs.map(async (addr) => {
            const vault = new ethers.Contract(addr, vaultAbi, wallet.provider!);
            const raw   = await vault.getInfo();
            return {
              address:       addr,
              itemName:      raw[1],
              reservePrice:  raw[3],
              status:        Number(raw[6]),
              bidderCount:   Number(raw[7]),
              winningAmount: raw[9],
              bidDeadline:   Number(raw[4]),
            } as AuctionSummary;
          })
        );

        const settled = results.filter(a => a.status === 2);
        const vol = settled.reduce((acc, a) => acc + a.winningAmount, 0n);

        setAuctions([...results].reverse());
        setCompleted(settled.length);
        setTotalVol(vol);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sellerAddress, wallet.provider]);

  const isOwnProfile = wallet.address?.toLowerCase() === sellerAddress.toLowerCase();

  return (
    <div style={styles.page}>
      <button style={styles.back} onClick={onBack}>← Back</button>

      <div style={styles.profileCard}>
        <div style={styles.avatar}>
          {sellerAddress.slice(2, 4).toUpperCase()}
        </div>
        <div>
          <p style={styles.address}>{sellerAddress.slice(0, 8)}…{sellerAddress.slice(-6)}</p>
          {isOwnProfile && <span style={styles.youBadge}>You</span>}
          <a
            href={`https://sepolia.arbiscan.io/address/${sellerAddress}`}
            target="_blank"
            style={styles.arbiscanLink}
          >
            View on Arbiscan ↗
          </a>
        </div>
      </div>

      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <p style={styles.statValue}>{auctions.length}</p>
          <p style={styles.statLabel}>Total auctions</p>
        </div>
        <div style={styles.statCard}>
          <p style={styles.statValue}>{completed}</p>
          <p style={styles.statLabel}>Completed</p>
        </div>
        <div style={styles.statCard}>
          <p style={styles.statValue}>{fmt(totalVol)}</p>
          <p style={styles.statLabel}>Total volume</p>
        </div>
      </div>

      <h2 style={styles.sectionTitle}>Auctions by this seller</h2>

      {loading ? (
        <p style={{ color: "#9ca3af" }}>Loading…</p>
      ) : auctions.length === 0 ? (
        <p style={{ color: "#9ca3af" }}>No auctions yet.</p>
      ) : (
        <div style={styles.list}>
          {auctions.map(a => (
            <div key={a.address} style={styles.row} onClick={() => onSelectAuction(a.address)}>
              <div style={{ flex: 1 }}>
                <p style={styles.itemName}>{a.itemName}</p>
                <p style={styles.itemSub}>
                  Reserve: {fmt(a.reservePrice)} · {a.bidderCount} bidder{a.bidderCount !== 1 ? "s" : ""}
                  {a.status === 2 && a.winningAmount > 0n && ` · Sold for ${fmt(a.winningAmount)}`}
                </p>
              </div>
              <span style={{ ...styles.badge, background: STATUS_COLOR[a.status] + "22", color: STATUS_COLOR[a.status] }}>
                {STATUS[a.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:         { padding: "32px 24px", maxWidth: 700, margin: "0 auto" },
  back:         { background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 14, marginBottom: 24, padding: 0 },
  profileCard:  { display: "flex", alignItems: "center", gap: 16, background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 24, marginBottom: 24 },
  avatar:       { width: 56, height: 56, borderRadius: "50%", background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#fff", flexShrink: 0 },
  address:      { fontSize: 16, fontWeight: 600, color: "#f9fafb", margin: "0 0 4px", fontFamily: "monospace" },
  youBadge:     { display: "inline-block", background: "#7c3aed22", color: "#a78bfa", fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600, marginBottom: 6, marginRight: 8 },
  arbiscanLink: { color: "#7c3aed", fontSize: 12, textDecoration: "none" },
  statsRow:     { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 32 },
  statCard:     { background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: "16px 20px" },
  statValue:    { fontSize: 22, fontWeight: 700, color: "#f9fafb", margin: "0 0 4px" },
  statLabel:    { fontSize: 12, color: "#6b7280", margin: 0 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: "#f9fafb", marginBottom: 12 },
  list:         { display: "flex", flexDirection: "column", gap: 8 },
  row:          { background: "#111827", border: "1px solid #1f2937", borderRadius: 10, padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" },
  itemName:     { fontSize: 15, fontWeight: 600, color: "#f9fafb", margin: "0 0 4px" },
  itemSub:      { fontSize: 12, color: "#6b7280", margin: 0 },
  badge:        { fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600, whiteSpace: "nowrap" },
};