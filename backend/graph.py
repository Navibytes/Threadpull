"""Typed evidence graph for portfolio investigation.

Weights are explainable prioritization values, not fraud probabilities.  The
graph is bipartite: a loan connects to typed attribute nodes, while connection
queries project those links into loan-to-loan clues.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import hashlib
import re
from typing import Any, Iterable, Mapping

import networkx as nx


SHARED_BY_NATURE = {"employer", "address", "dealer", "broker", "doc_template"}
HOUSEHOLD_FADE = 0.1


def _text(value: Any) -> str:
    return " ".join(str(value).strip().casefold().split()) if value is not None else ""


def _normalize(kind: str, value: Any) -> str:
    value = _text(value)
    if not value:
        return ""
    if kind == "phone":
        return re.sub(r"\D", "", value)
    if kind == "email":
        return value
    if kind == "bank_account":
        return re.sub(r"\s+", "", value)
    if kind == "device":
        return value
    if kind == "address":
        value = re.sub(r"[^a-z0-9 ]", "", value)
        for short, full in (("st", "street"), ("rd", "road"), ("ave", "avenue"),
                            ("blvd", "boulevard"), ("dr", "drive"),
                            ("ln", "lane"), ("ct", "court")):
            value = re.sub(rf"\b{short}\b", full, value)
        return value
    if kind == "dealer":
        return re.sub(r"[^a-z0-9]", "", value)
    if kind == "doc_template":
        return value
    return value


def _stable_id(kind: str, value: str) -> str:
    digest = hashlib.sha256(f"{kind}\0{value}".encode()).hexdigest()[:16]
    return f"{kind}:{digest}"


def _last_name(loan: Mapping[str, Any]) -> str:
    last = _text(loan.get("last_name"))
    if last:
        return last
    name = _text(loan.get("borrower_name") or loan.get("name"))
    if "," in name:
        return name.split(",", 1)[0].strip()
    return name.split()[-1] if name else ""


def _borrower_name(loan: Mapping[str, Any]) -> str:
    first, last = _text(loan.get("first_name")), _last_name(loan)
    return " ".join(x for x in (first, last) if x)


@dataclass(frozen=True)
class SourceRef:
    kind: str
    loan_id: str
    field: str
    origin: str

    def as_dict(self) -> dict[str, str]:
        return {"kind": self.kind, "loan_id": self.loan_id,
                "field": self.field, "origin": self.origin}


class EvidenceGraph:
    """Build and query an evidence graph from normalized loan mappings."""

    def __init__(self, loans: Iterable[Mapping[str, Any]] = ()) -> None:
        self.graph = nx.MultiGraph()
        self._loans: dict[str, dict[str, Any]] = {}
        self._loan_attributes: dict[str, list[tuple[str, str, SourceRef]]] = defaultdict(list)
        self.add_loans(loans)

    @staticmethod
    def _attributes(loan: Mapping[str, Any]) -> list[tuple[str, str, str, str]]:
        """Return (kind, raw value, source field, origin) tuples."""
        loan_id = str(loan.get("loan_id", ""))
        attrs: list[tuple[str, str, str, str]] = []
        direct = (
            ("phone", "phone"), ("email", "email"),
            ("bank_account", "bank_account"), ("device", "device_id"),
            ("address", "address"), ("employer", "employer"),
            ("dealer", "dealer_id"), ("broker", "broker_id"),
        )
        for kind, field in direct:
            value = loan.get(field)
            if not _text(value):
                continue
            origin = str(loan.get("submission_id") or f"loan:{loan_id}:{field}")
            attrs.append((kind, str(value), field, origin))
        for i, doc in enumerate(loan.get("documents") or []):
            if not isinstance(doc, Mapping):
                continue
            value = doc.get("template_id")
            if _text(value):
                doc_id = str(doc.get("doc_id") or i)
                attrs.append(("doc_template", str(value), f"documents[{doc_id}].template_id",
                              f"document:{doc_id}"))
        return attrs

    def add_loans(self, loans: Iterable[Mapping[str, Any]]) -> None:
        pending: list[tuple[str, str, str, SourceRef]] = []
        for raw in loans:
            loan = dict(raw)
            loan_id = str(loan.get("loan_id", "")).strip()
            if not loan_id:
                raise ValueError("Every loan must have a non-empty loan_id")
            if loan_id in self._loans:
                raise ValueError(f"Duplicate loan_id: {loan_id}")
            self._loans[loan_id] = loan
            self.graph.add_node(loan_id, type="loan", loan_id=loan_id)
            person_id = f"person:{loan_id}"
            self.graph.add_node(person_id, type="person",
                                display_value=" ".join(x for x in
                                    (str(loan.get("first_name", "")).strip(),
                                     str(loan.get("last_name", "")).strip()) if x))
            self.graph.add_edge(loan_id, person_id, key=f"{loan_id}|borrower",
                                edge_id=f"{loan_id}|borrower", kind="borrower",
                                weight=0.0, sources=[{"kind": "row", "loan_id": loan_id,
                                                     "field": "first_name,last_name"}],
                                origins=[f"loan:{loan_id}:borrower"], explained=False,
                                explanation_ref=None)
            for kind, raw_value, field, origin in self._attributes(loan):
                value = _normalize(kind, raw_value)
                if not value:
                    continue
                entity_id = _stable_id(kind, value)
                self.graph.add_node(entity_id, type=kind, display_value=raw_value)
                source = SourceRef("row", loan_id, field, origin)
                pending.append((loan_id, entity_id, kind, source))

        # Shared-by-nature links are diluted by the number of distinct loans.
        counts: dict[str, set[str]] = defaultdict(set)
        for loan_id, entity_id, kind, _ in pending:
            if kind in SHARED_BY_NATURE:
                counts[entity_id].add(loan_id)
        for loan_id, entity_id, kind, source in pending:
            n = len(counts[entity_id])
            weight = 1.0 / n if kind in SHARED_BY_NATURE and n else 1.0
            key = f"{loan_id}|{entity_id}|{source.origin}"
            self.graph.add_edge(loan_id, entity_id, key=key, edge_id=key,
                                kind=kind, weight=weight, sources=[source.as_dict()],
                                origins=[source.origin], explained=False,
                                explanation_ref=None)
            self._loan_attributes[loan_id].append((entity_id, kind, source))

    @property
    def loan_ids(self) -> tuple[str, ...]:
        return tuple(self._loans)

    def _projected_clues(self, loan_id: str) -> list[dict[str, Any]]:
        if loan_id not in self._loans:
            raise KeyError(f"Unknown loan_id: {loan_id}")
        clues: dict[tuple[str, str], dict[str, Any]] = {}
        for entity_id, kind, _ in self._loan_attributes[loan_id]:
            for neighbor in self.graph.neighbors(entity_id):
                if neighbor == loan_id or self.graph.nodes[neighbor].get("type") != "loan":
                    continue
                # An entity can be connected through multiple source records. Merge
                # them; downstream scoring counts each origin only once.
                edge_data = self.graph.get_edge_data(loan_id, entity_id) or {}
                other_edges = self.graph.get_edge_data(neighbor, entity_id) or {}
                relevant = [d for d in (*edge_data.values(), *other_edges.values())
                            if d.get("kind") == kind and not d.get("explained")]
                if not relevant:
                    continue
                weight = min(float(d["weight"]) for d in relevant)
                if kind == "phone" and self._is_household_pair(loan_id, neighbor):
                    weight *= HOUSEHOLD_FADE
                key = (neighbor, entity_id)
                clue = clues.setdefault(key, {
                    "edge_id": f"{kind}:{entity_id}", "kind": kind,
                    "a": loan_id, "b": neighbor, "entity_id": entity_id,
                    "weight": weight, "sources": [], "origins": [],
                    "explained": False, "explanation_ref": None,
                })
                clue["weight"] = min(clue["weight"], weight)
                for d in relevant:
                    for src in d.get("sources", []):
                        if src not in clue["sources"]:
                            clue["sources"].append(src)
                    for origin in d.get("origins", []):
                        if origin not in clue["origins"]:
                            clue["origins"].append(origin)
        return list(clues.values())

    def _is_household_pair(self, left_id: str, right_id: str) -> bool:
        left, right = self._loans[left_id], self._loans[right_id]
        def values(loan_id: str, kind: str) -> set[str]:
            return {value for entity_id, attr_kind, _ in self._loan_attributes[loan_id]
                    if attr_kind == kind
                    for value in [_normalize(kind, self.graph.nodes[entity_id].get("display_value", ""))]
                    if value}
        shared_address = bool(values(left_id, "address") & values(right_id, "address"))
        if not shared_address:
            return False
        same_last = bool(_last_name(left) and _last_name(left) == _last_name(right))
        left_coborrower = _text(left.get("co_applicant_name"))
        right_coborrower = _text(right.get("co_applicant_name"))
        listed = bool((left_coborrower and left_coborrower == _borrower_name(right)) or
                      (right_coborrower and right_coborrower == _borrower_name(left)))
        return same_last or listed

    def find_connections(self, loan_id: str) -> dict[str, Any]:
        """Return tool-contract-compatible neighboring loan clues at zero cost."""
        clues = self._projected_clues(loan_id)
        neighbors: dict[str, dict[str, Any]] = {}
        for clue in clues:
            item = neighbors.setdefault(clue["b"], {
                "loan_id": clue["b"], "priority_score": 0.0, "connections": []})
            item["priority_score"] += clue["weight"]
            item["connections"].append({k: clue[k] for k in
                ("edge_id", "kind", "weight", "sources", "origins", "explained")})
        result = sorted(neighbors.values(), key=lambda x: (-x["priority_score"], x["loan_id"]))
        return {"ok": True, "result": {"loan_id": loan_id, "neighbors": result},
                "sources": [s for c in clues for s in c["sources"]],
                "cost": {"acorns": 0, "unit": "1 graph query"}, "simulated": False}

    def priority_scores(self) -> dict[str, float]:
        """Rank leads by independent-origin evidence; values are not probabilities."""
        scores: dict[str, float] = {}
        for loan_id in self._loans:
            origin_weights: dict[str, float] = {}
            for clue in self._projected_clues(loan_id):
                if clue["explained"]:
                    continue
                # A source submission/document is one independent origin even if
                # several fields from it create separate graph edges.
                origins = {source.get("origin") for source in clue["sources"]
                           if source.get("loan_id") == loan_id and source.get("origin")}
                if not origins:
                    origins = set(clue["origins"] or [clue["edge_id"]])
                for origin in origins:
                    origin_weights[origin] = max(origin_weights.get(origin, 0.0), clue["weight"])
            scores[loan_id] = sum(origin_weights.values())
        return scores

    def ranked_leads(self) -> list[dict[str, Any]]:
        scores = self.priority_scores()
        return [{"loan_id": loan_id, "priority_score": score}
                for loan_id, score in sorted(scores.items(), key=lambda x: (-x[1], x[0]))]

    def explain_edge(self, edge_id: str, reason: str, proving_source: Mapping[str, Any]) -> dict[str, Any]:
        """Withdraw suspicion for a clue while preserving the auditable edge."""
        if not reason.strip():
            raise ValueError("An explanation reason is required")
        if not proving_source:
            raise ValueError("A proving source is required")
        found = False
        for _, _, _, data in self.graph.edges(keys=True, data=True):
            if data.get("edge_id") == edge_id:
                data.update(explained=True, explanation_ref={"reason": reason,
                            "source": dict(proving_source)}, weight=0.0)
                found = True
        # Projected IDs identify a shared attribute; explain every constituent link.
        if not found and ":" in edge_id:
            kind, entity_id = edge_id.split(":", 1)
            if entity_id in self.graph:
                for _, _, _, data in self.graph.edges(entity_id, keys=True, data=True):
                    if data.get("kind") == kind:
                        data.update(explained=True, explanation_ref={"reason": reason,
                                    "source": dict(proving_source)}, weight=0.0)
                        found = True
        if not found:
            raise KeyError(f"Unknown edge_id: {edge_id}")
        return {"edge_id": edge_id, "explained": True, "weight": 0.0,
                "reason": reason, "source": dict(proving_source)}


def build_evidence_graph(loans: Iterable[Mapping[str, Any]]) -> EvidenceGraph:
    return EvidenceGraph(loans)


def find_connections(graph: EvidenceGraph, loan_id: str) -> dict[str, Any]:
    return graph.find_connections(loan_id)
