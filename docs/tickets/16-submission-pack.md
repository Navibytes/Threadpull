# 16: Submission pack

**Owner:** D (Investigation), with everyone
**Target:** H23, Sun 08:00 (hard deadline 08:50)

**What to build:** The Devpost submission is in: a video that opens with the moment, a README and PROOF.md, and a clean public repo.

**Blocked by:** 13 Proof: fixed-rule baseline vs Hazel; 15 bun run demo, replay and judge seed

**Status:** in-progress (README, proof-status note, Devpost draft, and recording script prepared; demo and external submission steps pending)

**Update (Sat 23:05, checked against `main`):** README updated to match `main` (A, this PR). Open: the video, generated PROOF results, the secret scan of git history before the repo goes public, Devpost teammates.

- [ ] Video of at most 3 minutes opens with the live TU result on loan #37 (2201 + 2202 + 2101); a backup video of a real run is recorded.
- [x] README covers setup, where CRS is used, how Claude is used, real vs simulated, known limits, and the team.
- [ ] `docs/PROOF.md` contains generated results from ticket 13. Current report only documents that measurements are pending and makes no numerical claims.
- [x] A Devpost draft includes the seat line, opening line, and intended Hyphenate, CRS, Microsoft, and Anthropic tracks (`submission/DEVPOST.md`); final track selection and submission remain pending.
- [x] Secret scan: no `.env*` or CRS, Anthropic, or Supabase keys anywhere in git history; the repo is public. (A, Sun 02:00: no `.env` path ever tracked, no key patterns in any commit of any branch; repo visibility PUBLIC. Re-run before submitting.)
- [ ] All teammates are added to the Devpost project.

`submission/VIDEO_SCRIPT.md` is a timed recording plan, not a video. The repo currently has no end-to-end demo/replay command (issue 15), and the measured proof depends on issue 13, so the video, public-repo verification, and Devpost team setup are not claimed complete.

A local scan before the merge found no tracked `.env` path in reachable git history and no common credential patterns in reachable blobs or readable workspace files. Main adds `.env.example` and continues to ignore `.env*`; repeat the scan after merging and verify remote visibility before marking this complete.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
