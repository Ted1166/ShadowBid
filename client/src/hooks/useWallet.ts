import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { CHAIN_ID } from "../config/contracts";

export interface WalletState {
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  address: string | null;
  chainId: number | null;
  isCorrectChain: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): WalletState {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer,   setSigner]   = useState<ethers.JsonRpcSigner | null>(null);
  const [address,  setAddress]  = useState<string | null>(null);
  const [chainId,  setChainId]  = useState<number | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    const eth = (window as any).ethereum;
    if (!eth) { setError("MetaMask not detected. Please install MetaMask."); return; }

    try {
      const bp = new ethers.BrowserProvider(eth);
      await bp.send("eth_requestAccounts", []);
      const net = await bp.getNetwork();

      if (Number(net.chainId) !== CHAIN_ID) {
        try {
          await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }] });
        } catch {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: `0x${CHAIN_ID.toString(16)}`, chainName: "Arbitrum Sepolia", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://sepolia-rollup.arbitrum.io/rpc"], blockExplorerUrls: ["https://sepolia.arbiscan.io"] }],
          });
        }
      }

      const s = await bp.getSigner();
      const a = await s.getAddress();
      setProvider(bp);
      setSigner(s);
      setAddress(a);
      setChainId(Number(net.chainId));

      eth.on("accountsChanged", () => window.location.reload());
      eth.on("chainChanged",    () => window.location.reload());
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const disconnect = useCallback(() => {
    setProvider(null); setSigner(null); setAddress(null); setChainId(null);
  }, []);

  return {
    provider, signer, address, chainId,
    isCorrectChain: chainId === CHAIN_ID,
    error, connect, disconnect,
  };
}