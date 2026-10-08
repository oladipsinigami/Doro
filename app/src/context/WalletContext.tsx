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
import { useConnectWallet, useWallets } from "@privy-io/react-auth";
import { monadTestnet, monadTestnetParams } from "@/lib/chain";
import { pickActiveWallet } from "@/lib/active-wallet";

const createDoroWalletClient = (ethereum: Parameters<typeof custom>[0]) =>
  createWalletClient({ chain: monadTestnet, transport: custom(ethereum) });

/**
 * Derived from the factory above so the `chain` generic is preserved. A bare
 * `WalletClient` annotation drops it, which makes `writeContract` reject every
 * call for lacking a `chain` property.
 */
type DoroWalletClient = ReturnType<typeof createDoroWalletClient>;

/**
 * Privy hands back an EIP-1193 provider typed more loosely than viem's
 * transport accepts, so we hold it as the exact type `custom()` takes and cast
 * once at the boundary rather than loosening types everywhere downstream.
 */
type PrivyProvider = Parameters<typeof custom>[0];

/** The subset of a Privy `ConnectedWallet` this context actually calls. */
type PrivyWallet = {
  address: string;
  walletClientType: string;
  connectorType?: string;
  connectedAt?: number;
  getEthereumProvider: () => Promise<unknown>;
};

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
  connectPrivy: () => void;
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

  /**
   * Privy connectors (WalletConnect, Coinbase SDK, browser extensions chosen by
   * name) do not all expose themselves on `window.ethereum`. Keeping the active
   * provider here means `getWalletClient` works for all of them, not just the
   * one the browser happened to inject first.
   */
  const [privyProvider, setPrivyProvider] = useState<PrivyProvider | null>(null);

  const { connectWallet } = useConnectWallet();
  const { wallets } = useWallets();

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
  const connectPrivy = () => {
    setError(null);
    closeConnectModal();
    // Opens the Privy picker, which lists named wallets plus WalletConnect
    // for mobile. Nothing is routed to MetaMask unless it is chosen.
    connectWallet();
  };

  const connectInjected = async () => {
    setError(null);
    setIsConnecting(true);

    if (typeof window === "undefined" || !(window as any).ethereum) {
      setIsConnecting(false);
      setError("No EVM wallet detected. Install a wallet extension, or use WalletConnect to connect from your phone.");
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
    setPrivyProvider(null);
    localStorage.removeItem("doro_wallet_type");
  };

  /**
   * Mirror the Privy-connected wallet into this context. Privy owns the session,
   * so we read its address and cache the EIP-1193 provider for later signing
   * rather than prompting for accounts a second time.
   */
  useEffect(() => {
    // Privy returns every linked wallet in an unspecified order, so select
    // deliberately. Taking the last element handed back the embedded Privy key
    // and claimed gifts into a wallet the recipient never chose.
    // The selector is typed on the fields it reads; the live objects also carry
    // Privy's connector methods, so the chosen entry keeps its own prototype.
    const active = pickActiveWallet(wallets as any) as PrivyWallet | null;
    if (!active) {
      setPrivyProvider(null);
      setAddress(null);
      setChainId(null);
      setWalletType(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const provider = (await active.getEthereumProvider()) as unknown as PrivyProvider;
        if (cancelled || !provider) return;

        setPrivyProvider(provider);
        setWalletType("privy");
        setAddress(active.address as `0x${string}`);
        setIsModalOpen(false);
        setError(null);

        const hex = (await provider.request({ method: "eth_chainId" })) as `0x${string}`;
        setChainId(parseInt(hex, 16));

        try {
          const bal = await publicClient.getBalance({
            address: active.address as `0x${string}`,
          });
          setBalance(parseFloat(formatEther(bal)).toFixed(4));
        } catch {
          /* balance is cosmetic; ignore */
        }
      } catch (err) {
        console.warn("Could not read Privy wallet provider:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [wallets]);

  // Auto-connect if previously connected
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;

    /**
     * Restore a previous injected connection, but never over a Privy one.
     * Otherwise this silent restore overwrites the wallet the user just chose
     * on page load, which is the same class of bug as picking the wrong entry
     * out of the wallets array.
     */
    const savedType = localStorage.getItem("doro_wallet_type");
    if (savedType === "injected") {
      const ethereum = (window as any).ethereum;
      ethereum
        .request({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          if (accounts && accounts.length > 0) {
            setAddress((current) => {
              if (current) return current;
              return accounts[0] as `0x${string}`;
            });
            setWalletType((current) => current ?? "injected");
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
        return;
      }
      // A Privy session owns its own address. An injected extension firing this
      // event must not repoint the app at a different wallet.
      setAddress((current) => current ?? (accounts[0] as `0x${string}`));
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
    // Prefer the Privy connector. WalletConnect and Coinbase SDK sessions are
    // not reachable through window.ethereum, so checking the browser first
    // would sign with the wrong wallet.
    if (privyProvider) {
      return createDoroWalletClient(privyProvider);
    }
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
        connectPrivy,
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
  connectPrivy: () => {},
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
