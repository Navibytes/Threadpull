"use client";

import { useState } from "react";
import { FilingDrawer } from "./filing-drawer";
import { previewLoanSource } from "./preview-loan-source";

// Isolated development harness; never mounts or drives the investigator view.
export function DrawerPreview() {
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [useApi, setUseApi] = useState(false);
  return (
    <main className="min-h-dvh bg-cream p-4 text-walnut sm:p-8">
      <h1 className="font-display text-2xl font-semibold">Filing drawer preview</h1>
      <p className="mt-2 max-w-xl text-sm">Development only. Preview records and dispositions are synthetic. Selection stays in this preview.</p>
      <label className="my-4 flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={useApi} onChange={(event) => {
          setUseApi(event.target.checked);
          setSelectedLoanId(null);
        }} />
        Load from /api/loans instead
      </label>
      <div className="h-[min(850px,85dvh)] w-full max-w-sm">
        <FilingDrawer source={useApi ? undefined : previewLoanSource} selectedLoanId={selectedLoanId}
          onSelectLoan={(loan) => setSelectedLoanId(loan.loan_id)} />
      </div>
      <p role="status" className="mt-3 text-sm">{selectedLoanId ? `Selected loan: ${selectedLoanId}` : "Select a file to test the callback."}</p>
    </main>
  );
}
