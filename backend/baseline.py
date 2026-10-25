"""Deterministic fixed-checklist comparison runner for Hazel.

The baseline uses HazelRunner for the identical tool boundary, event format,
CRS guard, and acorn ledger. Its policy is fixed: walk graph-ranked leads,
inspect each, run the configured checklist in order, then close the lead.
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Mapping, Sequence

from .agent import HARD_IDENTITY_CODES, TOOL_COSTS, HazelRunner
from .graph import EvidenceGraph


def check_everything_acorns(loans: Sequence[Mapping[str, Any]], *,
                            checklist: Sequence[str] = ("find_connections", "inspect_loan",
                                                        "crs_identity_check"),
                            tool_costs: Mapping[str, int] = TOOL_COSTS) -> int:
    """Price one pass of the same fixed checklist over every eligible loan."""
    unknown = set(checklist) - set(tool_costs)
    if unknown:
        raise ValueError(f"No registered costs for checklist tools: {sorted(unknown)}")
    total = 0
    for loan in loans:
        for tool in checklist:
            if tool == "crs_identity_check" and loan.get("kind") != "case":
                continue
            total += int(tool_costs[tool])
    return total


class FixedChecklistModel:
    """Tool-calling model double implementing a deterministic baseline policy."""

    def __init__(self, loans: Sequence[Mapping[str, Any]], graph: EvidenceGraph,
                 checklist: Sequence[str] = ("find_connections", "inspect_loan",
                                             "crs_identity_check")) -> None:
        self.loans = {str(loan["loan_id"]): dict(loan) for loan in loans}
        self.graph = graph
        self.checklist = tuple(checklist)
        self.open_leads: set[str] = set()
        self.processed: set[str] = set()
        self.current: str | None = None
        self.stage = 0
        self.last_tool: str | None = None
        self.last_loan: str | None = None
        self.identity_codes: dict[str, set[str]] = {}
        self.identity_failed: set[str] = set()

    def complete(self, *, messages: Sequence[Mapping[str, Any]], **_: Any) -> Mapping[str, Any]:
        self._read_previous_result(messages)
        if self.current is None:
            text = str((messages[-1] or {}).get("content", "")) if messages else ""
            match = re.search(r"Investigate loan ([^ .]+)", text)
            if not match:
                return self._end()
            self.current = match.group(1)
            self.open_leads.add(self.current)

        while True:
            if self.current in self.processed:
                self.current = self._next_lead()
                self.stage = 0
                if self.current is None:
                    return self._end()
            loan_id = self.current
            loan = self.loans[loan_id]

            while self.stage < len(self.checklist):
                tool = self.checklist[self.stage]
                self.stage += 1
                if tool == "crs_identity_check" and loan.get("kind") != "case":
                    continue
                if tool not in {"find_connections", "inspect_loan", "crs_identity_check"}:
                    # The baseline only calls tools exposed by its configured
                    # checklist and supported by the shared runner.
                    continue
                return self._call(tool, loan_id)

            codes = self.identity_codes.get(loan_id, set())
            if loan_id in self.identity_failed:
                status = "Insufficient evidence"
                note = "A fixed checklist check failed, so evidence is insufficient."
            elif codes & HARD_IDENTITY_CODES:
                status = "Investigate"
                note = "Identity check returned a hard inconsistency."
            else:
                status = "No material anomaly found"
                note = "The fixed checklist found no hard identity inconsistency."
            self.processed.add(loan_id)
            return self._call("close_lead", loan_id, case_id=loan_id,
                              status=status, note=note)

    def _read_previous_result(self, messages: Sequence[Mapping[str, Any]]) -> None:
        if not self.last_tool or not messages:
            return
        content = messages[-1].get("content")
        if not isinstance(content, list):
            return
        for block in content:
            if not isinstance(block, Mapping) or block.get("type") != "tool_result":
                continue
            try:
                payload = json.loads(str(block.get("content", "{}")))
            except (TypeError, json.JSONDecodeError):
                payload = {}
            result = payload.get("result") or {}
            if self.last_tool == "find_connections" and isinstance(result, Mapping):
                for item in result.get("neighbors", []):
                    candidate = str(item.get("loan_id", ""))
                    if candidate in self.loans and candidate not in self.processed:
                        self.open_leads.add(candidate)
            elif self.last_tool == "crs_identity_check" and self.last_loan:
                if not payload.get("ok"):
                    self.identity_failed.add(self.last_loan)
                else:
                    codes = {
                        str(message.get("code", ""))
                        for message in result.get("messages", [])
                        if isinstance(message, Mapping)
                    }
                    self.identity_codes[self.last_loan] = codes
            self.last_tool = None
            self.last_loan = None
            break

    def _next_lead(self) -> str | None:
        scores = {item["loan_id"]: item["priority_score"]
                  for item in self.graph.ranked_leads()}
        candidates = self.open_leads - self.processed
        return min(candidates, key=lambda loan_id: (-scores.get(loan_id, 0), loan_id)) \
            if candidates else None

    def _call(self, tool: str, loan_id: str, **arguments: Any) -> Mapping[str, Any]:
        self.last_tool, self.last_loan = tool, loan_id
        arguments = arguments or {"loan_id": loan_id}
        return {"stop_reason": "tool_use", "content": [{
            "type": "tool_use", "id": f"baseline-{len(self.processed)}-{self.stage}-{tool}",
            "name": tool, "input": arguments,
        }]}

    @staticmethod
    def _end() -> Mapping[str, Any]:
        return {"stop_reason": "end_turn", "content": []}


def run_baseline(loans: Sequence[Mapping[str, Any]], graph: EvidenceGraph, *,
                 identity_check: Callable[[str], Any] | None = None,
                 budget: int = 60, run_id: str | None = None,
                 event_path: str | None = None, trace_path: str | None = None,
                 on_event: Callable[[dict[str, Any]], None] | None = None,
                 max_steps: int = 100,
                 checklist: Sequence[str] = ("find_connections", "inspect_loan",
                                             "crs_identity_check")) -> dict[str, Any]:
    """Run the baseline through Hazel's identical enforcement and logging."""
    model = FixedChecklistModel(loans, graph, checklist)
    return HazelRunner(
        loans, graph, model, identity_check=identity_check, budget=budget,
        run_id=run_id, event_path=event_path, trace_path=trace_path,
        on_event=on_event, max_steps=max_steps,
    ).run()
