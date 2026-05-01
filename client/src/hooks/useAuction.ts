import { useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import {
  ADDRESSES, FACTORY_ABI, VAULT_ABI, ERC20_ABI,
  makeCommitment, makeSalt, SALT_KEY,
} from "../config/contracts";

export interface AuctionInfo {
  auctioneer: string;
  itemName: string;
  itemDescription: string;
  reservePrice: bigint;
  bidDeadline: number;
  revealDeadline: number;
  status: number;
  bidderCount: number;
  winner: string;
  winningAmount: bigint;
}

export function useFactory(provider: ethers.BrowserProvider | null) {
  const [auctions, setAuctions] = useState<string[]>([]);
  const [loading,  setLoading]  = useState(false);

  const load = useCallback(async () => {
    if (!provider) return;
    setLoading(true);
    try {
      const f = new ethers.Contract(ADDRESSES.factory, FACTORY_ABI, provider);
      const all: string[] = await f.getAllAuctions();
      setAuctions([...all].reverse());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => { load(); }, [load]);
  return { auctions, loading, reload: load };
}

export function useCreateAuction(signer: ethers.JsonRpcSigner | null) {
  const [creating, setCreating] = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const create = useCallback(async (
    itemName: string,
    itemDescription: string,
    reservePrice: bigint,
    bidDuration: number,
    revealDuration: number,
  ) => {
    if (!signer) return null;
    setCreating(true); setError(null);
    try {
      const f  = new ethers.Contract(ADDRESSES.factory, FACTORY_ABI, signer);
      const feeData = await signer.provider!.getFeeData();
      const gas = {
        maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 3n : undefined,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      };
      const tx = await f.createAuction(itemName, itemDescription, reservePrice, bidDuration, revealDuration, gas);
      const receipt = await tx.wait();
      const iface   = new ethers.Interface(FACTORY_ABI);
      const log     = receipt.logs.map((l: any) => { try { return iface.parseLog(l); } catch { return null; } }).find((e: any) => e?.name === "AuctionCreated");
      return log?.args?.vault as string ?? null;
    } catch (e: any) {
      setError(e.reason || e.message);
      return null;
    } finally {
      setCreating(false);
    }
  }, [signer]);

  return { create, creating, error };
}

export function useAuction(
  vaultAddress: string | null,
  signer: ethers.JsonRpcSigner | null,
  provider: ethers.BrowserProvider | null,
  address: string | null,
) {
  const [info,      setInfo]      = useState<AuctionInfo | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [hasBid,    setHasBid]    = useState(false);
  const [hasReveal, setHasReveal] = useState(false);
  const [storedSalt, setStoredSalt] = useState<string | null>(null);
  const [storedAmount, setStoredAmount] = useState<string>("");
  const [usdcBalance, setUsdcBalance]   = useState<bigint>(0n);

  const getVault = useCallback((signerOrProvider: ethers.Signer | ethers.Provider) =>
    new ethers.Contract(vaultAddress!, VAULT_ABI, signerOrProvider),
  [vaultAddress]);

  const refresh = useCallback(async () => {
    if (!vaultAddress || !provider) return;
    setLoading(true);
    try {
      const vault = getVault(provider);
      const raw   = await vault.getInfo();
      setInfo({
        auctioneer:     raw[0],
        itemName:       raw[1],
        itemDescription: raw[2],
        reservePrice:   raw[3],
        bidDeadline:    Number(raw[4]),
        revealDeadline: Number(raw[5]),
        status:         Number(raw[6]),
        bidderCount:    Number(raw[7]),
        winner:         raw[8],
        winningAmount:  raw[9],
      });

      if (address) {
        const bid  = await vault.hasBid(address);
        const rev  = await vault.hasRevealed(address);
        setHasBid(bid);
        setHasReveal(rev);

        const stored = localStorage.getItem(SALT_KEY(vaultAddress, address));
        if (stored) {
          const { salt, amount } = JSON.parse(stored);
          setStoredSalt(salt);
          setStoredAmount(ethers.formatUnits(amount, 6));
        }

        const usdc = new ethers.Contract(ADDRESSES.usdc, ERC20_ABI, provider);
        const bal  = await usdc.balanceOf(address);
        setUsdcBalance(bal);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [vaultAddress, provider, address, getVault]);

  useEffect(() => { refresh(); }, [refresh]);

  const getGasOverrides = useCallback(async () => {
    if (!provider) return {};
    const feeData = await provider.getFeeData();
    return {
        maxFeePerGas: feeData.maxFeePerGas ? feeData.maxFeePerGas * 2n : undefined,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    };
    }, [provider]);

  const mintUsdc = useCallback(async (amount: bigint) => {
    if (!signer || !address) return;
    setTxLoading(true);
    try {
      const usdc = new ethers.Contract(ADDRESSES.usdc, ERC20_ABI, signer);
      const gas = await getGasOverrides();
      const tx   = await usdc.mint(address, amount, gas);
      await tx.wait();
      await refresh();
    } catch (e: any) {
      setError(e.reason || e.message);
    } finally {
      setTxLoading(false);
    }
  }, [signer, address, refresh, getGasOverrides]);

  const submitBid = useCallback(async (depositAmount: bigint) => {
    if (!signer || !address || !vaultAddress) return;
    setTxLoading(true); setError(null);
    try {
      const usdc = new ethers.Contract(ADDRESSES.usdc, ERC20_ABI, signer);
      const allowance: bigint = await usdc.allowance(address, vaultAddress);
      if (allowance < depositAmount) {
        const gas = await getGasOverrides();
        const approveTx = await usdc.approve(vaultAddress, depositAmount, gas);
        await approveTx.wait();
      }

      const salt = makeSalt();
      const commitment = makeCommitment(depositAmount, salt, address);
      const vault = getVault(signer);
      const gas = await getGasOverrides();
      const tx = await vault.submitBid(commitment, depositAmount, gas);
      await tx.wait();

      localStorage.setItem(SALT_KEY(vaultAddress, address), JSON.stringify({
        salt,
        amount: depositAmount.toString(),
      }));

      await refresh();
      return true;
    } catch (e: any) {
      setError(e.reason || e.message);
      return false;
    } finally {
      setTxLoading(false);
    }
  }, [signer, address, vaultAddress, getVault, getGasOverrides, refresh]);

  const openReveal = useCallback(async () => {
    if (!signer) return;
    setTxLoading(true); setError(null);
    try {
      const vault = getVault(signer);
      const gas = await getGasOverrides();
      const tx    = await vault.openRevealPhase(gas);
      await tx.wait();
      await refresh();
    } catch (e: any) {
      setError(e.reason || e.message);
    } finally {
      setTxLoading(false);
    }
  }, [signer, getVault, getGasOverrides, refresh]);

  const revealBid = useCallback(async (amount: bigint, salt: string) => {
    if (!signer) return;
    setTxLoading(true); setError(null);
    try {
      const vault = getVault(signer);
      const gas = await getGasOverrides();
      const tx = await vault.revealBid(amount, salt, gas);
      await tx.wait();
      await refresh();
    } catch (e: any) {
      setError(e.reason || e.message);
    } finally {
      setTxLoading(false);
    }
  }, [signer, getVault, getGasOverrides, refresh]);

  const settle = useCallback(async () => {
    if (!signer) return;
    setTxLoading(true); setError(null);
    try {
      const vault = getVault(signer);
      const gas = await getGasOverrides();
      const tx    = await vault.settleAuction(gas);
      await tx.wait();
      await refresh();
    } catch (e: any) {
      setError(e.reason || e.message);
    } finally {
      setTxLoading(false);
    }
  }, [signer, getVault, getGasOverrides, refresh]);

  const claimRefund = useCallback(async () => {
    if (!signer) return;
    setTxLoading(true); setError(null);
    try {
      const vault = getVault(signer);
      const gas = await getGasOverrides();
      const tx    = await vault.claimRefund(gas);
      await tx.wait();
      await refresh();
    } catch (e: any) {
      setError(e.reason || e.message);
    } finally {
      setTxLoading(false);
    }
  }, [signer, getVault, getGasOverrides, refresh]);

  return {
    info, loading, txLoading, error,
    hasBid, hasReveal, storedSalt, storedAmount, usdcBalance,
    refresh, mintUsdc, submitBid, openReveal, revealBid, settle, claimRefund,
  };
}