import type { LoanStatus } from "@/lib/events";

// Exact status words from SKELETON §3; colour only reinforces the word, it never replaces it.
const STYLE: Record<LoanStatus, string> = {
  "Not reviewed": "border-milk/50 bg-cream text-walnut",
  Investigate: "border-terracotta/60 bg-terracotta/10 text-terracotta",
  "No material anomaly found": "border-sage bg-sage/15 text-walnut",
  "Insufficient evidence": "border-honey bg-honey/15 text-walnut",
  "Human-confirmed disposition": "border-dusty bg-dusty/15 text-walnut",
};

export function StatusChip({ status }: { status: LoanStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STYLE[status]}`}>
      {status}
    </span>
  );
}
