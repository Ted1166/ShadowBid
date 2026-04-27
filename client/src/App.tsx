import { useState } from "react";
import { useWallet } from "./hooks/useWallet";
import Home from "./pages/Home";
import AuctionDetail from "./pages/AuctionDetail";

export default function App() {
  const wallet = useWallet();
  const [selectedAuction, setSelectedAuction] = useState<string | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: "#030712", color: "#f9fafb", fontFamily: "system-ui, sans-serif" }}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.logo}>ShadowBid</h1>
          <p style={styles.tagline}>Confidential sealed-bid auctions · iExec Nox</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {wallet.address ? (
            <div style={styles.addressPill}>
              <span style={styles.dot} />
              {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
            </div>
          ) : (
            <button style={styles.connectBtn} onClick={wallet.connect}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {wallet.error && (
        <div style={styles.errorBanner}>{wallet.error}</div>
      )}

      {!wallet.isCorrectChain && wallet.address && (
        <div style={styles.errorBanner}>Wrong network. Please switch to Arbitrum Sepolia.</div>
      )}

      {selectedAuction ? (
        <AuctionDetail
          vaultAddress={selectedAuction}
          wallet={wallet}
          onBack={() => setSelectedAuction(null)}
        />
      ) : (
        <Home
          wallet={wallet}
          onSelectAuction={setSelectedAuction}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    borderBottom: "1px solid #1f2937",
    padding: "16px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky",
    top: 0,
    background: "#030712",
    zIndex: 10,
  },
  logo:       { fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" },
  tagline:    { fontSize: 12, color: "#6b7280", margin: "2px 0 0" },
  connectBtn: { background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  addressPill: { background: "#1f2937", border: "1px solid #374151", borderRadius: 999, padding: "6px 12px", fontSize: 13, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 6 },
  dot:        { width: 8, height: 8, borderRadius: "50%", background: "#22c55e" },
  errorBanner: { background: "#450a0a", borderBottom: "1px solid #dc2626", padding: "12px 24px", color: "#f87171", fontSize: 13 },
};