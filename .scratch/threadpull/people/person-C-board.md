# Person C: Board

**Good fit:** Frontend

**Your tickets, in order:**

| Ticket | Title | Target | Blocked by |
| --- | --- | --- | --- |
| 01 | Contracts and walking skeleton | Sat 12:00 | None |
| 09 | Investigator UI: filing drawer, corkboard and notebook | Sat 18:00 | 01, 05 |
| 12 | Detector freeze and held-out set | Sun 02:00 | 07, 08, 11 |
| 15 | make demo, replay and judge seed | Sun 04:00 | 09, 10 |

**Who waits on you:** Everyone codes against your contracts (01) from noon, so freeze them on time. You write no detection code: that's why you own the held-out set (12).

**First 30 minutes:**

1. Create the repo structure with `.env` and data outputs gitignored before the first commit.
1. Write the shared types for loan record, tool result and event (SKELETON §5.1, §7, §8) and post them to the team.
1. Hand-write a sample event log with every event type so you can build the board before Hazel exists.

**While you're blocked:** Build 09 against the sample log while waiting for 05; switch to the live stream when it lands. Help A with the falling-string animation (07).

**Team checkpoints:** Sat 12:00 contracts frozen · Sat 21:00 one full rough run · Sun 04:00 feature freeze · Sun 08:00 submit (hard deadline 08:50).

Tickets live in `../issues/`; the full spec is SKELETON.md.
