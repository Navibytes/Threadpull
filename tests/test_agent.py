import json
import tempfile
import unittest
from pathlib import Path

from backend.agent import HazelRunner
from backend.graph import EvidenceGraph
from backend.rules import RuleMemory


def tool_call(name, args, call_id):
    return {"stop_reason": "tool_use", "content": [{
        "type": "tool_use", "id": call_id, "name": name, "input": args,
    }]}


class ScriptedModel:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def complete(self, **request):
        self.requests.append(request)
        return self.responses.pop(0)


class HazelRunnerTests(unittest.TestCase):
    def setUp(self):
        self.loans = [
            {"loan_id": "L1", "kind": "case", "first_name": "A", "last_name": "One",
             "phone": "555-0100"},
            {"loan_id": "L2", "kind": "case", "first_name": "B", "last_name": "Two",
             "phone": "5550100"},
        ]
        self.graph = EvidenceGraph(self.loans)

    def test_tool_loop_writes_events_trace_and_code_owned_statuses(self):
        model = ScriptedModel([
            tool_call("find_connections", {"loan_id": "L1"}, "c1"),
            tool_call("crs_identity_check", {"loan_id": "L1"}, "c2"),
            tool_call("close_lead", {"case_id": "L1", "status": "No material anomaly found",
                                      "note": "Identity has a hard inconsistency."}, "c3"),
            tool_call("close_lead", {"case_id": "L2", "status": "Investigate",
                                      "note": "No identity check was available."}, "c4"),
        ])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            streamed = []
            runner = HazelRunner(
                self.loans, self.graph, model, budget=6, run_id="run-test",
                event_path=root / "events.jsonl", trace_path=root / "agent_trace.jsonl",
                on_event=streamed.append,
                identity_check=lambda loan_id: {
                    "ok": True, "result": {"messages": [{"code": "2202"}]},
                    "sources": [{"kind": "crs", "request_id": "req-2202"}],
                    "simulated": False,
                },
            )
            result = runner.run()
            events = [json.loads(line) for line in (root / "events.jsonl").read_text().splitlines()]
            traces = [json.loads(line) for line in (root / "agent_trace.jsonl").read_text().splitlines()]

        self.assertEqual(result["summary"]["budget_spent"], 3)
        self.assertEqual(result["summary"]["statuses"], {
            "L1": "Investigate", "L2": "Insufficient evidence"})
        self.assertEqual([event["seq"] for event in streamed],
                         [event["seq"] for event in result["events"]])
        self.assertIn("lead_opened", [event["type"] for event in events])
        self.assertIn("link_found", [event["type"] for event in events])
        self.assertIn("budget_spent", [event["type"] for event in events])
        self.assertEqual(events[-1]["type"], "run_finished")
        lead_event = next(event for event in events if event["type"] == "lead_opened")
        self.assertTrue(lead_event["sources"])
        self.assertLessEqual(lead_event["note"].count("."), 2)
        self.assertEqual([trace["direction"] for trace in traces].count("model_input"), 4)
        status_event = next(event for event in events if event["type"] == "status_changed"
                            and event.get("loan_ids") == ["L1"]
                            and event.get("tool") == "close_lead")
        self.assertEqual(status_event["result"]["proposed_status"], "No material anomaly found")
        self.assertEqual(status_event["result"]["status"], "Investigate")
        self.assertIn("req-2202", status_event["note"])
        self.assertLessEqual(status_event["note"].count("."), 2)

    def test_budget_refusal_does_not_call_crs(self):
        model = ScriptedModel([
            tool_call("crs_identity_check", {"loan_id": "L1"}, "c1"),
        ])
        called = []
        with tempfile.TemporaryDirectory() as tmp:
            runner = HazelRunner(self.loans, self.graph, model, budget=2,
                                 identity_check=lambda loan_id: called.append(loan_id),
                                 event_path=Path(tmp) / "events.jsonl",
                                 trace_path=Path(tmp) / "trace.jsonl")
            result = runner.run()
        self.assertEqual(called, [])
        self.assertEqual(result["summary"]["reason"], "budget_exhausted")
        self.assertEqual(result["summary"]["budget_spent"], 0)

    def test_background_loan_is_refused_before_identity_adapter(self):
        loans = [{"loan_id": "B1", "kind": "background", "phone": "555-0111"}]
        model = ScriptedModel([
            tool_call("crs_identity_check", {"loan_id": "B1"}, "c1"),
            {"stop_reason": "end_turn", "content": [{"type": "text", "text": "done"}]},
        ])
        called = []
        with tempfile.TemporaryDirectory() as tmp:
            runner = HazelRunner(loans, EvidenceGraph(loans), model,
                                 identity_check=lambda loan_id: called.append(loan_id),
                                 event_path=Path(tmp) / "events.jsonl",
                                 trace_path=Path(tmp) / "trace.jsonl")
            result = runner.run()
        self.assertEqual(called, [])
        self.assertEqual(result["summary"]["budget_spent"], 0)
        self.assertIn("recovery", [event["type"] for event in result["events"]])

    def test_ask_human_is_routed_and_confidence_is_backend_computed(self):
        model = ScriptedModel([
            tool_call("find_connections", {"loan_id": "L1"}, "c1"),
            tool_call("crs_identity_check", {"loan_id": "L1"}, "c2"),
            tool_call("ask_human", {"loan_id": "L1", "question": "Is this shared employer routine?",
                                     "topic": "shared_employer", "reason": "no precedent"}, "c3"),
            tool_call("close_lead", {"case_id": "L1", "status": "Investigate",
                                      "note": "A policy question is pending."}, "c4"),
            tool_call("close_lead", {"case_id": "L2", "status": "Investigate",
                                      "note": "No separate identity check was run."}, "c5"),
        ])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            rules = RuleMemory(root / "rules")
            runner = HazelRunner(
                self.loans, self.graph, model, run_id="ask-test", rule_memory=rules,
                event_path=root / "events.jsonl", trace_path=root / "trace.jsonl",
                identity_check=lambda loan_id: {"ok": True, "result": {"messages": []},
                                                "sources": [{"kind": "crs", "request_id": "req-clean"}]},
                rule_context_provider=lambda loan_id, other_id, clue: {
                    "link_kind": clue.get("kind"), "group_size": 500,
                    "tenure_on_credit_file": True,
                },
            )
            result = runner.run()
            pending = rules.pending_questions()
        asked = next(event for event in result["events"] if event["type"] == "question_asked")
        self.assertEqual(asked["result"]["to"], "CRO")
        self.assertEqual(asked["result"]["confidence"], 50)
        self.assertEqual(asked["result"]["reason"], "no precedent")
        self.assertEqual(len(pending), 1)

    def test_scoped_rule_application_emits_rule_and_explanation_events(self):
        loans = [
            {"loan_id": "E1", "kind": "case", "employer": "Large Systems"},
            {"loan_id": "E2", "kind": "case", "employer": "large systems"},
        ]
        model = ScriptedModel([
            tool_call("find_connections", {"loan_id": "E1"}, "c1"),
            tool_call("close_lead", {"case_id": "E1", "status": "Investigate", "note": "Rule applied."}, "c2"),
            tool_call("close_lead", {"case_id": "E2", "status": "Investigate", "note": "Rule applied."}, "c3"),
        ])
        with tempfile.TemporaryDirectory() as tmp:
            rules = RuleMemory(Path(tmp) / "rules")
            question = rules.ask_human(run_id="prior", loan_id="X1", question="Can this employer link be cleared?",
                                       topic="shared_employer", reason="no precedent")
            rules.answer_question(question["id"], answer="Yes if group size and tenure qualify.",
                                  answered_by="CRO", when={"link_kind": "employer",
                                                           "min_group_size": 500,
                                                           "tenure_on_credit_file": True},
                                  reason_text="Large employer; tenure verified.")
            rules.confirm_rule(question["id"], confirmed_by="CRO")
            runner = HazelRunner(
                loans, EvidenceGraph(loans), model, rule_memory=rules,
                event_path=Path(tmp) / "events.jsonl", trace_path=Path(tmp) / "trace.jsonl",
                rule_context_provider=lambda loan_id, other_id, clue: {
                    "link_kind": clue.get("kind"), "group_size": 700,
                    "tenure_on_credit_file": True,
                },
            )
            result = runner.run()
            retained = runner.graph.find_connections("E1")["result"]["neighbors"]
        applied = next(event for event in result["events"] if event["type"] == "rule_applied")
        explained = next(event for event in result["events"] if event["type"] == "clue_explained")
        self.assertEqual(applied["result"]["rule_id"], "R-001")
        self.assertTrue(applied["result"]["ruled_at"])
        self.assertEqual(explained["sources"][-1]["rule_id"], "R-001")
        self.assertEqual(retained, [])


if __name__ == "__main__":
    unittest.main()
