"use client";

import React from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { monadTestnet } from "@/lib/chain";

export default function Providers({ children }: { children: React.ReactNode }) {
  // Privy requires an app ID of exactly 25 characters
  const appId =
    process.env.NEXT_PUBLIC_PRIVY_APP_ID && process.env.NEXT_PUBLIC_PRIVY_APP_ID.length === 25
      ? process.env.NEXT_PUBLIC_PRIVY_APP_ID
      : "cl00000000000000000000000";

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["twitter", "wallet"],
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        appearance: {
          theme: "dark",
          accentColor: "#836EF9",
          logo: "https://monad.xyz/favicon.ico",
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
