"use client";

import React from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { monadTestnet } from "@/lib/chain";

export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "cm2sampleprivyappid";

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
