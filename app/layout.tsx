import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Lynto — Payments for autonomous software",
  description:
    "Deposit USDC. Use APIs. Settle automatically. Prepaid balances, offchain metering, batched onchain settlement on Arc.",
  icons: {
    icon: "/images/lynto-L-neon-yellow.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
