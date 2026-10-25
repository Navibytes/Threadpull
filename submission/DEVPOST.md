# Devpost submission draft

## Project name

Threadpull

## One-line description

An AI fraud investigator that follows evidence across an auto-loan portfolio, spends verification budget on the strongest leads, and withdraws suspicion when a normal explanation is supported.

## Opening line

Upload the loan tape. We tell you which borrowers don't exist, which ones only look suspicious, and how much less to pay.

## Seat

Fraud investigator on a bank's portfolio-acquisition due-diligence team.

## Description

Banks buying an auto-loan portfolio need to find coordinated fraud without treating every shared phone, address, employer, or dealer as proof. Threadpull is a prototype for that investigation seat.

Hazel follows weighted links between loans and their evidence. A connection is a lead, not a verdict: the system is designed to spend limited checks where they matter, record the sources behind each step, and lower suspicion when a check supports an ordinary explanation. Questions that need policy judgment can become scoped rules, so the same question does not have to be asked again outside that rule's scope.

The project is built around a human decision-maker. Hazel cannot approve a purchase or take action against a borrower. The intended CRO review brings investigation evidence and proposed portfolio actions together for a person to decide.

The repository includes the TypeScript portfolio generator, evidence graph, explanation checks, CRS identity check with persona guard and acorn ledger, ask-once rules, and Hazel's tool loop. The complete UI/demo, the remaining CRS tools, and measured seed results are still in progress; update this draft with the final demo and generated `docs/PROOF.md` before submission.

## How we use AI

Claude selects Hazel's next allowed tool and writes short, source-cited notes. Plain backend code enforces the tool boundary, budget, saved statuses, and event log. The model does not determine final dispositions or compute deal prices.

## Tracks to select

- Hyphenate — Autonomous Systems for Finance
- CRS — Identity/Fraud
- CRS — Financial AI Agent
- CRS — Best Overall
- Microsoft — Built for the Real World
- Anthropic

Confirm the exact track names and eligibility in Devpost before submitting.

## Built with

TypeScript, Bun, Zod, Faker, graphology, Anthropic TypeScript SDK (Claude Sonnet 5.5), CRS sandbox API, Supabase. Planned: a React/React Flow investigator board.

## Team members

Add the four project teammates to the Devpost project: Person A (Evidence), Person B (Verification), Person C (Board), and Person D (Investigation). Replace role labels with each teammate's Devpost account/name.
