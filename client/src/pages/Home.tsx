import { useState } from "react";
import { ethers } from "ethers";
import { useFactory, useCreateAuction } from "../hooks/useAuction";
import { STATUS, STATUS_COLOR, fmt, countdown } from "../config/contracts";
import type { WalletState } from "../hooks/useWallet";

interface AuctionCardProps {
  vaultAddress: string;
  provider: ethers.BrowserProvider;
  onClick: () => void;
}

function AuctionCard({ vaultAddress, provider, onClick }: AuctionCardProps) {
  const [info, setInfo] = useState<any>(null);

  useState(() => {
    const vault = new ethers.Contract(vaultAddress, [
      "function getInfo() external view returns (address, string, string, uint256, uint256, uint256, uint8, uint256, address, uint256)",
    ], provider);
    vault.getInfo().then((raw: any) => {
      setInfo({
        itemName:     raw[1],
        itemDescription: raw[2],
        reservePrice: raw[3],
        bidDeadline:  Number(raw[4]),
        status:       Number(raw[6]),
        bidderCount:  Number(raw[7]),
      });
    }).catch(() => {});
  });

  if (!info) return <div style={styles.cardSkeleton} />;

  const now    = Math.floor(Date.now() / 1000);
  const isOpen = info.status === 0 && now <= info.bidDeadline;

  return (
    <div style={styles.card} onClick={onClick}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3 style={styles.cardTitle}>{info.itemName}</h3>
        <span style={{ ...styles.badge, background: STATUS_COLOR[info.status] + "22", color: STATUS_COLOR[info.status] }}>
          {STATUS[info.status]}
        </span>
      </div>
      <p style={styles.cardDesc}>{info.itemDescription}</p>
      <div style={styles.cardFooter}>
        <span>Reserve: <b>{fmt(info.reservePrice)}</b></span>
        <span>{info.bidderCount} bidder{info.bidderCount !== 1 ? "s" : ""}</span>
      </div>
      {isOpen && (
        <p style={{ color: "#22c55e", fontSize: 12, marginTop: 6 }}>
          {countdown(info.bidDeadline)} remaining
        </p>
      )}
    </div>
  );
}

interface Props {
  wallet: WalletState;
  onSelectAuction: (addr: string) => void;
}

export default function Home({ wallet, onSelectAuction }: Props) {
  const { auctions, loading, reload } = useFactory(wallet.provider);
  const { create, creating, error: createError } = useCreateAuction(wallet.signer);

  const [form, setForm] = useState({
    itemName: "", itemDescription: "", reservePrice: "",
    bidHours: "24", revealHours: "6",
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const vault = await create(
      form.itemName,
      form.itemDescription,
      ethers.parseUnits(form.reservePrice, 6),
      Number(form.bidHours) * 3600,
      Number(form.revealHours) * 3600,
    );
    if (vault) {
      setForm({ itemName: "", itemDescription: "", reservePrice: "", bidHours: "24", revealHours: "6" });
      reload();
    }
  };

  return (
    <div style={styles.page}>
      {wallet.address && (
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Create Auction</h2>
          <form onSubmit={handleCreate} style={styles.form}>
            <input style={styles.input} required placeholder="Item name" value={form.itemName}
              onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} />
            <textarea style={{ ...styles.input, height: 72 }} placeholder="Description" value={form.itemDescription}
              onChange={e => setForm(f => ({ ...f, itemDescription: e.target.value }))} />
            <div style={{ display: "flex", gap: 12 }}>
              <input style={styles.input} required type="number" placeholder="Reserve price (USDC)" value={form.reservePrice}
                onChange={e => setForm(f => ({ ...f, reservePrice: e.target.value }))} />
              <input style={{ ...styles.input, width: 120 }} type="number" placeholder="Bid hours" value={form.bidHours}
                onChange={e => setForm(f => ({ ...f, bidHours: e.target.value }))} />
              <input style={{ ...styles.input, width: 130 }} type="number" placeholder="Reveal hours" value={form.revealHours}
                onChange={e => setForm(f => ({ ...f, revealHours: e.target.value }))} />
            </div>
            {createError && <p style={styles.error}>{createError}</p>}
            <button style={styles.btnPrimary} type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create Auction"}
            </button>
          </form>
        </section>
      )}

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Auctions {!loading && `(${auctions.length})`}</h2>
        {loading ? <p style={{ color: "#9ca3af" }}>Loading…</p> :
          auctions.length === 0 ? <p style={{ color: "#9ca3af" }}>No auctions yet.</p> :
            <div style={styles.grid}>
              {auctions.map(addr => (
                <AuctionCard
                  key={addr}
                  vaultAddress={addr}
                  provider={wallet.provider!}
                  onClick={() => onSelectAuction(addr)}
                />
              ))}
            </div>
        }
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:         { padding: "32px 24px", maxWidth: 900, margin: "0 auto" },
  section:      { marginBottom: 48 },
  sectionTitle: { fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#f9fafb" },
  form:         { background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", gap: 12 },
  input:        { background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "10px 12px", color: "#f9fafb", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" },
  btnPrimary:   { background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  grid:         { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 },
  card:         { background: "#111827", border: "1px solid #1f2937", borderRadius: 12, padding: 20, cursor: "pointer", transition: "border-color 0.2s" },
  cardSkeleton: { background: "#111827", border: "1px solid #1f2937", borderRadius: 12, height: 140 },
  cardTitle:    { fontSize: 15, fontWeight: 600, color: "#f9fafb", margin: 0 },
  cardDesc:     { fontSize: 13, color: "#6b7280", marginTop: 8, marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cardFooter:   { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#9ca3af" },
  badge:        { fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600 },
  error:        { color: "#f87171", fontSize: 13 },
};