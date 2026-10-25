"""Evaluation helpers for the baseline-versus-Hazel proof.

This module computes proof rows from run events and an answer key. It never
loads answer-key data into the detector or changes a detector decision.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any


FLAGGED_STATUSES = {"Investigate", "Insufficient evidence"}


def evaluate_run(events: Sequence[Mapping[str, Any]], answer_key: Mapping[str, Any], *,
                 runtime_ms: int | None = None) -> dict[str, Any]:
    """Calculate the issue 13 metrics for one completed run.

    A ring member is found when the run leaves it under investigation. A
    lookalike is left flagged when its final status is Investigate or
    Insufficient evidence. An unnecessary escalation is a CRS call or human
    question concerning a lookalike loan. This definition is deliberately
    explicit so all compared agents use the same answer-key accounting.
    """
    finished = next((event for event in reversed(events)
                     if event.get("type") == "run_finished"), None)
    summary = (finished or {}).get("result") or {}
    statuses = summary.get("statuses") or {}

    ring_ids = {str(loan_id) for ring in answer_key.get("rings", [])
                for loan_id in ring.get("loan_ids", [])}
    lookalike_ids = {str(loan_id) for case in answer_key.get("lookalikes", [])
                     for loan_id in case.get("loan_ids", [])}
    found = sum(statuses.get(loan_id) == "Investigate" for loan_id in ring_ids)
    innocents_flagged = sum(statuses.get(loan_id) in FLAGGED_STATUSES
                            for loan_id in lookalike_ids)

    unnecessary_escalations = 0
    questions_asked = 0
    for event in events:
        event_type = event.get("type")
        related = {str(value) for value in event.get("loan_ids", [])}
        if (event_type == "check_run" and event.get("tool", "").startswith("crs_")
                and (event.get("result") or {}).get("state") == "started"):
            unnecessary_escalations += len(related & lookalike_ids)
        if event_type == "question_asked":
            questions_asked += 1
            result = event.get("result") or {}
            related.update(str(value) for value in result.get("related_loan_ids", []))
            related.update(str(value) for value in result.get("loan_ids", []))
            unnecessary_escalations += len(related & lookalike_ids)

    return {
        "ring_members_found": found,
        "ring_members_total": len(ring_ids),
        "innocents_left_flagged": innocents_flagged,
        "innocents_total": len(lookalike_ids),
        "unnecessary_escalations": unnecessary_escalations,
        "acorns_spent": summary.get("budget_spent"),
        "questions_asked": questions_asked,
        "runtime_ms": runtime_ms if runtime_ms is not None else summary.get("runtime_ms"),
        "simulated": any(bool(event.get("simulated")) for event in events),
    }


def proof_markdown(results: Sequence[Mapping[str, Any]], *,
                   check_everything_costs: Mapping[int, int],
                   detector_frozen_commit: str) -> str:
    """Render comparable proof records as a Markdown table.

    Each record must have ``seed``, ``agent``, ``commit`` and a ``metrics``
    mapping returned by :func:`evaluate_run`. ``check_everything_costs`` holds
    the full-pass acorn cost for each seed. Simulated calls are marked in the
    agent column. Missing runs are never filled with estimates.
    """
    required_seeds = {13, 99}
    if not detector_frozen_commit:
        raise ValueError("detector-frozen commit hash is required")
    seen: set[tuple[int, str]] = set()
    lines = [
        "# Proof: fixed-rule baseline vs Hazel",
        "",
        "All measurements below are generated from recorded run events and the",
        "separate answer key. Seed 99 is the held-out run and must be recorded",
        "once after the `detector-frozen` tag. Simulated CRS calls are labeled.",
        "",
        "| Seed | Agent | Ring members found | Innocents left flagged | Unnecessary escalations | Acorns | Check-everything cost | Questions | Runtime (ms) | Commit |",
        "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for record in results:
        seed = int(record["seed"])
        agent = str(record["agent"])
        metrics = record["metrics"]
        commit = str(record["commit"])
        key = (seed, agent)
        if key in seen:
            raise ValueError(f"duplicate proof run for seed {seed}, agent {agent}")
        if not commit or commit.casefold() in {"unknown", "none"}:
            raise ValueError(f"missing commit hash for seed {seed}, agent {agent}")
        seen.add(key)
        label = agent + (" (simulated calls)" if metrics.get("simulated") else "")
        if seed not in check_everything_costs:
            raise ValueError(f"missing check-everything cost for seed {seed}")
        cost = check_everything_costs[seed]
        lines.append(
            f"| {seed} | {label} | {metrics['ring_members_found']}/{metrics['ring_members_total']} "
            f"| {metrics['innocents_left_flagged']}/{metrics['innocents_total']} "
            f"| {metrics['unnecessary_escalations']} | {metrics['acorns_spent']} | {cost} "
            f"| {metrics['questions_asked']} | {metrics['runtime_ms']} | `{commit}` |"
        )
    required_runs = {(seed, agent) for seed in required_seeds
                     for agent in ("hazel", "baseline")}
    if seen != required_runs:
        raise ValueError("proof results must include exactly one Hazel and baseline run for seeds 13 and 99")
    if set(check_everything_costs) != required_seeds:
        raise ValueError("check-everything costs must include both seed 13 and held-out seed 99")
    heldout_commits = {str(record["commit"]) for record in results
                       if int(record["seed"]) == 99}
    if heldout_commits != {detector_frozen_commit}:
        raise ValueError("every seed 99 result must use the detector-frozen commit")
    return "\n".join(lines) + "\n"


def write_proof(path: str | Path, results: Sequence[Mapping[str, Any]], *,
                check_everything_costs: Mapping[int, int],
                detector_frozen_commit: str) -> None:
    """Write a generated proof table; caller supplies recorded run results."""
    Path(path).write_text(proof_markdown(
        results, check_everything_costs=check_everything_costs,
        detector_frozen_commit=detector_frozen_commit), encoding="utf-8")


def records_from_runs(runs: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Build proof records directly from event logs and separate answer keys.

    Input items contain ``seed``, ``agent``, ``commit``, ``events`` and
    ``answer_key``. Keeping metric calculation here prevents hand-transcribed
    table values from becoming the source of truth.
    """
    records = []
    for run in runs:
        records.append({
            "seed": run["seed"],
            "agent": run["agent"],
            "commit": run["commit"],
            "metrics": evaluate_run(run["events"], run["answer_key"]),
        })
    return records
