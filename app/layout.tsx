import type { Metadata } from "next";
import { Caveat, Fraunces, IBM_Plex_Sans } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex" });
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat" });

export const metadata: Metadata = {
  title: "Threadpull",
  description: "Find the ring. Protect the innocent. Decide the deal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plex.variable} ${caveat.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
