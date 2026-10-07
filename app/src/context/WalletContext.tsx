"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  http,
  type PublicClient,
} from "viem";
import { monadTestnet, monadTestnetParams } from "@/lib/chain";

const createDoroWalletClient = (ethereum: Parameters<typeof custom>[0]) =>
  createWalletClient({ chain: monadTestnet, transport: custom(ethereum) });

/**
 * Derived from the factory above so the `chain` generic is preserved. A bare
 * `WalletClient` annotation drops it, which makes `writeContract` reject every
 * call for lacking a `chain` property.
 */
type DoroWalletClient = ReturnType<typeof createDoroWalletClient>;

export interface WalletContextType {
  isConnected: boolean;
  address: `0x${string}` | null;
  balance: string;
  chainId: number | null;
  isCorrectNetwork: boolean;
  walletType: "injected" | "privy" | null;
  isConnecting: boolean;
  error: string | null;
  isModalOpen: boolean;
  openConnectModal: () => void;
  closeConnectModal: () => void;
  connectInjected: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  disconnect: () => void;
  getWalletClient: () => Promise<DoroWalletClient | null>;
  publicClient: PublicClient;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz"),
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [balance, setBalance] = useState<string>("0.00");
  const [chainId, setChainId] = useState<number | null>(null);
  const [walletType, setWalletType] = useState<"injected" | "privy" | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isConnected = !!address;
  const isCorrectNetwork = chainId === monadTestnet.id;

  const openConnectModal = () => setIsModalOpen(true);
  const closeConnectModal = () => {
    setIsModalOpen(false);
    setError(null);
  };

  // Fetch balance for connected address
  const refreshBalance = useCallback(async () => {
    if (!address) return;
    try {
      const bal = await publicClient.getBalance({ address });
      const formatted = parseFloat(formatEther(bal)).toFixed(4);
      setBalance(formatted);
    } catch (err) {
      console.warn("Could not fetch balance:", err);
    }
  }, [address]);

  useEffect(() => {
    if (address) {
      refreshBalance();
      const interval = setInterval(refreshBalance, 8000);
      return () => clearInterval(interval);
    }
  }, [address, refreshBalance]);

  // Switch / Add Monad Testnet in Injected Wallet
  const switchNetwork = async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      throw new Error("No browser wallet found.");
    }
    const ethereum = (window as any).ethereum;
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: monadTestnetParams.chainId }],
      });
      setChainId(monadTestnet.id);
    } catch (switchError: any) {
      if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [monadTestnetParams],
        });
        setChainId(monadTestnet.id);
      } else {
        throw switchError;
      }
    }
  };

  // Connect Injected Browser Wallet (MetaMask, Rabby, OKX, Phantom, etc.)
  const connectInjected = async () => {
    setError(null);
    setIsConnecting(true);

    if (typeof window === "undefined" || !(window as any).ethereum) {
      setIsConnecting(false);
      setError("No EVM wallet detected. Please install MetaMask, Rabby, or OKX Wallet.");
      return;
    }

    try {
      const ethereum = (window as any).ethereum;

      // Request account access
      const accounts = await ethereum.request({
        method: "eth_requestAccounts",
      });

      if (!accounts || accounts.length === 0) {
        throw new Error("No account selected.");
      }

      const selectedAddress = accounts[0] as `0x${string}`;
      setAddress(selectedAddress);
      setWalletType("injected");

      // Verify and switch network to Monad Testnet
      const currentChainHex = await ethereum.request({ method: "eth_chainId" });
      const currentChainNum = parseInt(currentChainHex, 16);
      setChainId(currentChainNum);

      if (currentChainNum !== monadTestnet.id) {
        try {
          await switchNetwork();
        } catch (netErr: any) {
          console.warn("User dismissed or encountered network switch prompt:", netErr);
        }
      }

      // Initial balance check
      try {
        const bal = await publicClient.getBalance({ address: selectedAddress });
        setBalance(parseFloat(formatEther(bal)).toFixed(4));
      } catch (balErr) {
        console.warn("Failed to get initial balance", balErr);
      }

      localStorage.setItem("doro_wallet_type", "injected");
      closeConnectModal();
    } catch (err: any) {
      console.error("Wallet connection failed:", err);
      setError(err?.message || "Failed to connect wallet.");
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect
  const disconnect = () => {
    setAddress(null);
    setBalance("0.00");
    setChainId(null);
    setWalletType(null);
    localStorage.removeItem("doro_wallet_type");
  };

  // Auto-connect if previously connected
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;
    const savedType = localStorage.getItem("doro_wallet_type");
    if (savedType === "injected") {
      const ethereum = (window as any).ethereum;
      ethereum
        .request({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          if (accounts && accounts.length > 0) {
            setAddress(accounts[0] as `0x${string}`);
            setWalletType("injected");
            ethereum
              .request({ method: "eth_chainId" })
              .then((hex: string) => setChainId(parseInt(hex, 16)))
              .catch(() => {});
          }
        })
        .catch(() => {});
    }

    // Account change listener
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setAddress(accounts[0] as `0x${string}`);
      }
    };

    const handleChainChanged = (hex: string) => {
      setChainId(parseInt(hex, 16));
    };

    const ethereum = (window as any).ethereum;
    if (ethereum?.on) {
      ethereum.on("accountsChanged", handleAccountsChanged);
      ethereum.on("chainChanged", handleChainChanged);
      return () => {
        ethereum.removeListener?.("accountsChanged", handleAccountsChanged);
        ethereum.removeListener?.("chainChanged", handleChainChanged);
      };
    }
  }, []);

  // Get Viem Wallet Client
  const getWalletClient = async (): Promise<DoroWalletClient | null> => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      return null;
    }
    return createDoroWalletClient((window as any).ethereum);
  };

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        address,
        balance,
        chainId,
        isCorrectNetwork,
        walletType,
        isConnecting,
        error,
        isModalOpen,
        openConnectModal,
        closeConnectModal,
        connectInjected,
        switchNetwork,
        disconnect,
        getWalletClient,
        publicClient,
        refreshBalance,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

const defaultWalletState: WalletContextType = {
  isConnected: false,
  address: null,
  balance: "0.00",
  chainId: null,
  isCorrectNetwork: true,
  walletType: null,
  isConnecting: false,
  error: null,
  isModalOpen: false,
  openConnectModal: () => {},
  closeConnectModal: () => {},
  connectInjected: async () => {},
  switchNetwork: async () => {},
  disconnect: () => {},
  getWalletClient: async () => null,
  publicClient,
  refreshBalance: async () => {},
};

export function useWallet() {
  const context = useContext(WalletContext);
  return context || defaultWalletState;
}
