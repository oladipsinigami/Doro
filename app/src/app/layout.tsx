import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Doro — Native MON Gifting for X on Monad Testnet",
  description:
    "Gift native MON to any X (Twitter) handle. Claimable and unwrappable on Monad Testnet via Privy embedded wallets and EIP-712 vouchers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased flex flex-col min-h-screen">
        <Providers>
          <Navbar />
          <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 flex flex-col items-center">
            {children}
          </main>
          <footer className="w-full border-t border-monad-border/40 py-6 text-center text-xs text-zinc-500">
            Doro (δῶρο) • Built for Monad Metropolis Hackathon 2026 • Monad Testnet (Chain ID 10143)
          </footer>
        </Providers>
      </body>
    </html>
  );
}
