// The CRO screen's accuracy block: the proof runs show the scores from docs/PROOF.md; any other run says it has none.
import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Scorecard } from "@/components/cro/scorecard";
import { PROOF } from "@/components/landing/proof-data";

test("a proof run shows its measured scores and both baselines", () => {
  for (const p of PROOF) {
    const html = renderToStaticMarkup(<Scorecard runId={p.run} />);
    expect(html).toContain(`seed ${p.seed}`);
    for (const r of p.rows) expect(html).toContain(`>${r.ring}<`);
    expect(html).toContain(`after ${p.ringCompleteAt} acorns`);
  }
});

test("any other run has no score, and says why", () => {
  const html = renderToStaticMarkup(<Scorecard runId="rt-abc123-20261025T100000" />);
  expect(html).toContain("This run has no accuracy score");
  expect(html).not.toContain("of 12");
});
