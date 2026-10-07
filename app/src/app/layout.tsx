import type { Metadata } from "next";
import { Fraunces, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import Navbar from "@/components/Navbar";
import VoidBackground from "@/components/VoidBackground";

const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Doro — Send MON to any X handle",
  description:
    "Gift native MON to any X handle on Monad Testnet. They sign in with X to claim it. You can take it back after 7 days.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="antialiased min-h-screen flex flex-col bg-[#07060b] text-[#F6F0E2] selection:bg-[#6E3EAE]/40">
        <VoidBackground />
        <Providers>
          <Navbar />
          <div className="flex-1 w-full flex flex-col">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
