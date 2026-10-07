"use client";

import React from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { monadTestnet } from "@/lib/chain";
import { WalletProvider } from "@/context/WalletContext";
import ConnectWalletModal from "@/components/ConnectWalletModal";

export default function Providers({ children }: { children: React.ReactNode }) {
  const rawAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  const appId =
    rawAppId && rawAppId.length === 25
      ? rawAppId
      : "cl00000000000000000000000";

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["twitter"],
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "off",
          },
        },
        appearance: {
          theme: "dark",
          accentColor: "#6E56CF",
          logo: "https://monad.xyz/favicon.ico",
        },
      }}
    >
      <WalletProvider>
        {children}
        <ConnectWalletModal />
      </WalletProvider>
    </PrivyProvider>
  );
}
