"""Persistent ask-once questions and scoped investigation rules."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
from typing import Any, Callable, Mapping, Sequence
import uuid

import yaml


REASONS = {"no precedent", "sources disagree"}
ROUTES = {
    "policy": "CRO", "shared_employer": "CRO", "fraud_alert": "CRO",
    "credit_policy": "CRO", "partial_data": "credit analyst",
    "bureau_disagreement": "credit analyst", "credit_file": "credit analyst",
    "buyback": "legal", "contract": "legal", "sanctions": "compliance",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def confidence_from_weights(supporting: Sequence[float],
                            contradicting: Sequence[float]) -> int:
    """Return weighted support for the proposed interpretation, as a percent.

    This is an evidence balance for escalation context, not a fraud probability.
    With no weighted evidence, report neutral confidence (50%).
    """
    values = [*supporting, *contradicting]
    if any(not math.isfinite(float(value)) or float(value) < 0 for value in values):
        raise ValueError("clue weights must be finite non-negative numbers")
    support = sum(float(value) for value in supporting)
    oppose = sum(float(value) for value in contradicting)
    total = support + oppose
    return round(100 * support / total) if total else 50


@dataclass
class Question:
    id: str
    run_id: str
    loan_id: str
    question: str
    topic: str
    to: str
    confidence: int
    reason: str
    confidence_basis: dict[str, Any]
    context: dict[str, Any]
    sources: list[dict[str, Any]]
    created_at: str
    status: str = "pending"
    answer: str | None = None
    answered_by: str | None = None
    answered_at: str | None = None
    rule_draft: dict[str, Any] | None = None
    rule_id: str | None = None
    related_loan_ids: list[str] = field(default_factory=list)


@dataclass
class Rule:
    id: str
    created_from: str
    when: dict[str, Any]
    then: str
    reason_text: str
    version: int
    ruled_at: str
    confirmed_by: str


class RuleMemory:
    """Question queue and versioned rule repository rooted at ``rules/``.

    Rule documents are ordinary YAML. Questions live in `questions.json` beside
    them so pending/answered work survives process and run boundaries.
    """

    def __init__(self, root: str | Path = "rules", *,
                 event_sink: Callable[[str, Mapping[str, Any]], None] | None = None) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.questions_path = self.root / "questions.json"
        self.event_sink = event_sink

    def _emit(self, event_type: str, result: Mapping[str, Any],
              event_sink: Callable[[str, Mapping[str, Any]], None] | None = None) -> None:
        sink = event_sink or self.event_sink
        if sink:
            sink(event_type, result)

    @staticmethod
    def route(topic: str) -> str:
        key = re.sub(r"[^a-z0-9]+", "_", topic.casefold()).strip("_")
        try:
            return ROUTES[key]
        except KeyError as exc:
            raise ValueError(f"No recipient route configured for topic: {topic}") from exc

    def _load_questions(self) -> list[Question]:
        if not self.questions_path.exists():
            return []
        payload = json.loads(self.questions_path.read_text(encoding="utf-8"))
        for item in payload:
            item.setdefault("confidence_basis", {})
            item.setdefault("related_loan_ids", [item.get("loan_id", "")])
        return [Question(**item) for item in payload]

    def _save_questions(self, questions: Sequence[Question]) -> None:
        self._write_atomic(self.questions_path,
                           json.dumps([asdict(q) for q in questions], indent=2, ensure_ascii=False))

    @staticmethod
    def _write_atomic(path: Path, text: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix(path.suffix + ".tmp")
        temp.write_text(text + "\n", encoding="utf-8")
        temp.replace(path)

    def _load_rules(self) -> list[Rule]:
        rules = []
        for path in sorted(self.root.glob("R-*.yaml")):
            data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            data.setdefault("ruled_at", "")
            data.setdefault("confirmed_by", "CRO")
            rules.append(Rule(**data))
        return rules

    @staticmethod
    def _rule_dict(rule: Rule) -> dict[str, Any]:
        return asdict(rule)

    def pending_questions(self) -> list[dict[str, Any]]:
        return [asdict(q) for q in self._load_questions() if q.status == "pending"]

    def get_question(self, question_id: str) -> Question:
        for question in self._load_questions():
            if question.id == question_id:
                return question
        raise KeyError(f"Unknown question: {question_id}")

    def ask_human(self, *, run_id: str, loan_id: str, question: str, topic: str,
                  reason: str, supporting_weights: Sequence[float] = (),
                  contradicting_weights: Sequence[float] = (),
                  context: Mapping[str, Any] | None = None,
                  sources: Sequence[Mapping[str, Any]] = (),
                  event_sink: Callable[[str, Mapping[str, Any]], None] | None = None) -> dict[str, Any]:
        question_text = question.strip()
        if not question_text:
            raise ValueError("question text is required")
        if reason not in REASONS:
            raise ValueError(f"reason must be one of {sorted(REASONS)}")
        recipient = self.route(topic)
        confidence = confidence_from_weights(supporting_weights, contradicting_weights)
        support_total = sum(float(value) for value in supporting_weights)
        contradicting_total = sum(float(value) for value in contradicting_weights)
        questions = self._load_questions()
        context_value = dict(context or {})
        existing_rule = self.match(context_value)
        if existing_rule:
            return {"already_resolved_by_rule": True, "rule": existing_rule,
                    "loan_id": loan_id, "context": context_value}
        # Avoid putting the same unresolved question in front of the human twice.
        existing = next((q for q in questions if q.status in
                         {"pending", "answered_pending_confirmation"} and
                         q.topic == topic and q.context == context_value and
                         (bool(context_value) or q.question.casefold() == question_text.casefold())), None)
        if existing:
            if loan_id not in existing.related_loan_ids:
                existing.related_loan_ids.append(loan_id)
            for source in sources:
                normalized_source = dict(source)
                if normalized_source not in existing.sources:
                    existing.sources.append(normalized_source)
            self._save_questions(questions)
            return asdict(existing)
        number = max((int(q.id[2:]) for q in questions if re.fullmatch(r"q-\d+", q.id)), default=0) + 1
        item = Question(
            id=f"q-{number:03d}", run_id=run_id, loan_id=loan_id,
            question=question_text, topic=topic, to=recipient,
            confidence=confidence, reason=reason,
            confidence_basis={"supporting_weight": support_total,
                              "contradicting_weight": contradicting_total,
                              "method": "support / (support + contradicting); 50 when no weights"},
            context=context_value,
            sources=[dict(s) for s in sources], created_at=utc_now(),
            related_loan_ids=[loan_id],
        )
        questions.append(item)
        self._save_questions(questions)
        result = asdict(item)
        self._emit("question_asked", result, event_sink)
        return result

    def answer_question(self, question_id: str, *, answer: str, answered_by: str,
                        when: Mapping[str, Any], then: str = "explain_link",
                        reason_text: str | None = None, rule_id: str | None = None,
                        event_sink: Callable[[str, Mapping[str, Any]], None] | None = None) -> dict[str, Any]:
        answer = answer.strip()
        answered_by = answered_by.strip()
        if not answer or not answered_by:
            raise ValueError("answer and answered_by are required")
        if not when:
            raise ValueError("a scoped rule draft is required")
        if then != "explain_link":
            raise ValueError("only explain_link rules are supported in this ticket")
        questions = self._load_questions()
        question = next((q for q in questions if q.id == question_id), None)
        if question is None:
            raise KeyError(f"Unknown question: {question_id}")
        if question.status != "pending":
            raise ValueError(f"Question {question_id} is not pending")
        selected_rule_id = rule_id or f"R-{self._next_rule_number():03d}"
        existing_path = self._rule_path(selected_rule_id)
        existing_version = 0
        if existing_path.exists():
            existing_data = yaml.safe_load(existing_path.read_text(encoding="utf-8")) or {}
            existing_version = int(existing_data.get("version", 0))
        question.answer = answer
        question.answered_by = answered_by
        question.answered_at = utc_now()
        question.status = "answered_pending_confirmation"
        question.rule_id = selected_rule_id
        question.rule_draft = {
            "id": question.rule_id, "created_from": self._created_from(question),
            "when": dict(when), "then": then,
            "reason_text": (reason_text or answer).strip(), "version": existing_version + 1,
            "ruled_at": question.answered_at, "confirmed_by": answered_by,
        }
        self._save_questions(questions)
        self._emit("question_answered", {
            "question_id": question.id, "answer": question.answer,
            "answered_by": question.answered_by, "answered_at": question.answered_at,
            "rule_draft": question.rule_draft, "confirmed": False,
        }, event_sink)
        return asdict(question)

    @staticmethod
    def _created_from(question: Question) -> str:
        return (f"question {question.id}, answered by {question.answered_by} "
                f"at {question.answered_at}")

    def _next_rule_number(self) -> int:
        numbers = [int(match.group(1)) for path in self.root.glob("R-*.yaml")
                   if (match := re.fullmatch(r"R-(\d+)\.yaml", path.name))]
        questions = self._load_questions()
        numbers.extend(int(q.rule_id[2:]) for q in questions if q.rule_id and
                       re.fullmatch(r"R-\d+", q.rule_id))
        return max(numbers, default=0) + 1

    def confirm_rule(self, question_id: str, *, confirmed_by: str,
                     event_sink: Callable[[str, Mapping[str, Any]], None] | None = None) -> dict[str, Any]:
        questions = self._load_questions()
        question = next((q for q in questions if q.id == question_id), None)
        if question is None:
            raise KeyError(f"Unknown question: {question_id}")
        if question.status != "answered_pending_confirmation" or not question.rule_draft:
            raise ValueError("There is no answer and rule draft awaiting confirmation")
        if not confirmed_by.strip():
            raise ValueError("confirmed_by is required")
        rule_data = dict(question.rule_draft)
        rule_data["confirmed_by"] = confirmed_by.strip()
        existing = self._rule_path(rule_data["id"])
        if existing.exists():
            previous = yaml.safe_load(existing.read_text(encoding="utf-8"))
            history_dir = self.root / "history"
            history_dir.mkdir(parents=True, exist_ok=True)
            archive = history_dir / f"{previous['id']}-v{int(previous['version']):03d}.yaml"
            self._write_yaml(archive, previous)
            rule_data["version"] = int(previous["version"]) + 1
        rule = Rule(**rule_data)
        self._write_yaml(existing, asdict(rule))
        question.status = "confirmed"
        question.rule_draft = asdict(rule)
        question.rule_id = rule.id
        self._save_questions(questions)
        event = {"question_id": question.id, "answer": question.answer,
                 "answered_by": question.answered_by, "answered_at": question.answered_at,
                 "rule": asdict(rule), "confirmed_by": confirmed_by.strip()}
        self._emit("question_answered", event, event_sink)
        return asdict(rule)

    def _rule_path(self, rule_id: str) -> Path:
        if not re.fullmatch(r"R-\d{3,}", rule_id):
            raise ValueError("invalid rule id")
        return self.root / f"{rule_id}.yaml"

    @staticmethod
    def _write_yaml(path: Path, value: Mapping[str, Any]) -> None:
        text = yaml.safe_dump(dict(value), sort_keys=False, allow_unicode=True)
        RuleMemory._write_atomic(path, text.rstrip())

    def rules(self) -> list[dict[str, Any]]:
        return [asdict(rule) for rule in self._load_rules()]

    @staticmethod
    def _condition_matches(key: str, expected: Any,
                           context: Mapping[str, Any]) -> bool:
        if key.startswith("min_"):
            actual_key = key[4:]
            actual = context.get(actual_key)
            try:
                return actual is not None and float(actual) >= float(expected)
            except (TypeError, ValueError):
                return False
        if key.startswith("max_"):
            actual_key = key[4:]
            actual = context.get(actual_key)
            try:
                return actual is not None and float(actual) <= float(expected)
            except (TypeError, ValueError):
                return False
        if key not in context:
            return False
        actual = context[key]
        if isinstance(expected, bool):
            return actual is expected
        if isinstance(expected, str):
            return str(actual).casefold() == expected.casefold()
        return actual == expected

    def match(self, context: Mapping[str, Any]) -> dict[str, Any] | None:
        matches = []
        for rule in self._load_rules():
            if all(self._condition_matches(key, expected, context)
                   for key, expected in rule.when.items()):
                matches.append(rule)
        if not matches:
            return None
        selected = max(matches, key=lambda rule: (len(rule.when), rule.version, rule.id))
        return asdict(selected)

    def apply(self, context: Mapping[str, Any], *, loan_ids: Sequence[str],
              source: Mapping[str, Any],
              event_sink: Callable[[str, Mapping[str, Any]], None] | None = None) -> dict[str, Any] | None:
        rule = self.match(context)
        if rule is None:
            return None
        payload = {"rule_id": rule["id"], "version": rule["version"],
                   "ruled_at": rule["ruled_at"], "loan_ids": list(loan_ids),
                   "when": rule["when"], "then": rule["then"],
                   "reason_text": rule["reason_text"], "source": dict(source)}
        self._emit("rule_applied", payload, event_sink)
        return payload

    def reset(self) -> None:
        """Clear rules, archived versions, and questions for a fresh demo."""
        for path in self.root.glob("R-*.yaml"):
            path.unlink()
        history = self.root / "history"
        if history.exists():
            for path in history.glob("R-*-v*.yaml"):
                path.unlink()
            if not any(history.iterdir()):
                history.rmdir()
        if self.questions_path.exists():
            self.questions_path.unlink()
