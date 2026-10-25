// The CRO review screen (ticket 10): /cro, or /cro?run=<run_id>. Neutral styling, separate from the cork board.
import type { Metadata } from "next";
import { CroScreen } from "@/components/cro/cro-screen";

export const metadata: Metadata = {
  title: "CRO review · Threadpull",
  description: "The deal, what the investigation cost, where the risk sits, and the proposed actions to approve or override.",
};

export default function CroPage() {
  return <CroScreen />;
}
