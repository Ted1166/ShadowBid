import { useWallet } from "./hooks/useWallet";
import { useNavigate, useParams, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import AuctionDetail from "./pages/AuctionDetail";
import SellerProfile from "./pages/SellerProfile";

function AuctionWrapper({ wallet }: { wallet: any }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return <AuctionDetail vaultAddress={id!} wallet={wallet} onBack={() => navigate("/")} onViewSeller={addr => navigate(`/seller/${addr}`)} />;
}

function SellerWrapper({ wallet }: { wallet: any }) {
  const { address } = useParams<{ address: string }>();
  const navigate = useNavigate();
  return <SellerProfile sellerAddress={address!} wallet={wallet} onSelectAuction={addr => navigate(`/auction/${addr}`)} onBack={() => navigate(-1)} />;
}

export default function App() {
  const wallet = useWallet();
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: "#030712", color: "#f9fafb", fontFamily: "system-ui, sans-serif" }}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo.svg" alt="ShadowBid" style={{ width: 36, height: 36 }} />
          <div>
            <h1 style={styles.logo}>ShadowBid</h1>
            <p style={styles.tagline}>Confidential sealed-bid auctions · iExec Nox</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {wallet.address ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={styles.addressPill}>
                <span style={styles.dot} />
                {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}
              </div>
              <button style={styles.disconnectBtn} onClick={wallet.disconnect}>
                Disconnect
              </button>
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

      <Routes>
        <Route path="/" element={<Home wallet={wallet} onSelectAuction={addr => navigate(`/auction/${addr}`)} />} />
        <Route path="/auction/:id" element={<AuctionWrapper wallet={wallet} />} />
        <Route path="/seller/:address" element={<SellerWrapper wallet={wallet} />} />
      </Routes>
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
  disconnectBtn: {
    background: "none",
    border: "1px solid #374151",
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 12,
    color: "#9ca3af",
    cursor: "pointer",
  },
  logo:       { fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" },
  tagline:    { fontSize: 12, color: "#6b7280", margin: "2px 0 0" },
  connectBtn: { background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  addressPill: { background: "#1f2937", border: "1px solid #374151", borderRadius: 999, padding: "6px 12px", fontSize: 13, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 6 },
  dot:        { width: 8, height: 8, borderRadius: "50%", background: "#22c55e" },
  errorBanner: { background: "#450a0a", borderBottom: "1px solid #dc2626", padding: "12px 24px", color: "#f87171", fontSize: 13 },
};