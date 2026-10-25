// Upload a loan tape (upload, Phase 2). The page sends the file to POST /api/tapes and shows the intake report;
// running Hazel on an uploaded tape is Phase 3 and is marked as not built yet.
import type { Metadata } from "next";
import { Pushpin } from "@/components/board/pushpin";
import { SITE_NAV, SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import { UploadDesk } from "@/components/upload/upload-desk";
import s from "@/components/landing/landing.module.css";
import u from "@/components/upload/upload.module.css";

export const metadata: Metadata = {
  title: "Upload a loan tape · Threadpull",
  description: "Hand over a loan tape (JSON or CSV). Every row is checked on its own, and the intake report says what was accepted and why the rest wasn't.",
};

export default function UploadPage() {
  return (
    <div className={`${s.page} room min-h-full`}>
      <SiteHeader nav={SITE_NAV(false)} />
      <main id="main" className={`${s.gutter} pt-10 pb-16 lg:pt-14`}>
        <p className={`sticky-note ${s.note}`}>evidence intake</p>
        <h1 className={`${s.sectionTitle} mt-5 max-w-3xl`}>Hand over the loan tape.</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed">
          JSON or CSV, up to 5,000 loans. Every row is checked on its own: a bad row is set aside with its reasons, and the
          rest of the tape goes on without it.
        </p>

        <div className="mt-10 grid grid-cols-[minmax(0,1fr)] items-start gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <UploadDesk />

          <aside className={`${s.sheet} ${u.rules} lg:col-start-2 lg:row-start-1`} aria-labelledby="house-rules">
            <span className={u.rulesPin} aria-hidden><Pushpin color="red" size={26} /></span>
            <h2 id="house-rules" className="font-display text-2xl font-semibold">House rules</h2>
            <ol>
              <li>
                <span><strong>Synthetic or sandbox data only.</strong> A row whose SSN could belong to a real person is refused,
                  and the number is never repeated back.</span>
              </li>
              <li>
                <span><strong>Nothing is verified yet.</strong> Intake makes no CRS calls and spends no acorns; that happens when
                  Hazel works the case.</span>
              </li>
              <li>
                <span><strong>No guessed facts.</strong> An uploaded tape has no address or employer lookups, so those checks say
                  &ldquo;unknown&rdquo; instead of guessing.</span>
              </li>
              <li>
                <span><strong>Stays with this app.</strong> Accepted loans are saved on the server that took them
                  (<code className={s.monoLight}>data/out/uploads</code> when it runs locally). Investigating a tape also keeps its loans in the
                  app&apos;s own database, so the CRO screen can read them; they go nowhere else.</span>
              </li>
            </ol>
            <p className="mt-5 text-[0.95rem] leading-relaxed">
              CSV columns follow the template. <code className={s.monoLight}>kind</code>, <code className={s.monoLight}>persona_id</code> and
              the co-applicant columns are optional. A JSON tape can also carry pay stubs and applications.
            </p>
          </aside>
        </div>
      </main>
      <SiteFooter onLanding={false} />
    </div>
  );
}
