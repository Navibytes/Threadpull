import tempfile
import unittest
from pathlib import Path

import yaml

from backend.rules import RuleMemory, confidence_from_weights


class RuleMemoryTests(unittest.TestCase):
    def test_confidence_is_computed_from_weights_and_is_not_a_probability_label(self):
        self.assertEqual(confidence_from_weights([2, 1], [1]), 75)
        self.assertEqual(confidence_from_weights([], []), 50)
        with self.assertRaises(ValueError):
            confidence_from_weights([-0.1], [])

    def test_question_routes_deduplicates_and_persists_across_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            events = []
            store = RuleMemory(tmp, event_sink=lambda kind, result: events.append((kind, result)))
            first = store.ask_human(
                run_id="run-1", loan_id="L1", question="Is this large employer link routine?",
                topic="shared_employer", reason="no precedent", supporting_weights=[0.25],
                contradicting_weights=[1], context={"link_kind": "employer", "group_size": 500},
                sources=[{"kind": "row", "loan_id": "L1", "field": "employer"}],
            )
            duplicate = store.ask_human(
                run_id="run-2", loan_id="L2", question="Different wording, same scope",
                topic="shared_employer", reason="no precedent", context={
                    "link_kind": "employer", "group_size": 500},
                sources=[{"kind": "row", "loan_id": "L2", "field": "employer"}],
            )
            reloaded = RuleMemory(tmp)
            self.assertEqual(first["to"], "CRO")
            self.assertEqual(first["confidence"], 20)
            self.assertEqual(first["confidence_basis"]["supporting_weight"], 0.25)
            self.assertEqual(first["confidence_basis"]["contradicting_weight"], 1.0)
            self.assertEqual(first["id"], duplicate["id"])
            self.assertEqual(duplicate["related_loan_ids"], ["L1", "L2"])
            self.assertEqual(len(reloaded.pending_questions()), 1)
            self.assertEqual([event[0] for event in events], ["question_asked"])

    def test_rule_is_draft_until_confirmed_then_applies_only_in_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            events = []
            store = RuleMemory(tmp, event_sink=lambda kind, result: events.append((kind, result)))
            question = store.ask_human(
                run_id="run-1", loan_id="L1", question="Does employer size explain this link?",
                topic="policy", reason="no precedent", context={"link_kind": "employer"},
            )
            draft = store.answer_question(
                question["id"], answer="Yes, if staff count is at least 500 and tenure is verified.",
                answered_by="CRO", when={"link_kind": "employer", "min_group_size": 500,
                                          "tenure_on_credit_file": True},
                reason_text="Large employer; tenure confirmed on the credit file.",
            )
            self.assertEqual(draft["status"], "answered_pending_confirmation")
            self.assertEqual(store.rules(), [])
            rule = store.confirm_rule(question["id"], confirmed_by="CRO")
            self.assertEqual(rule["id"], "R-001")
            self.assertEqual(rule["version"], 1)
            self.assertEqual(yaml.safe_load((Path(tmp) / "R-001.yaml").read_text()), rule)
            self.assertEqual(store.match({"link_kind": "employer", "group_size": 600,
                                          "tenure_on_credit_file": True})["id"], "R-001")
            self.assertIsNone(store.match({"link_kind": "employer", "group_size": 40,
                                           "tenure_on_credit_file": True}))
            self.assertIsNone(store.match({"link_kind": "employer", "group_size": 600,
                                           "tenure_on_credit_file": False}))
            applied = store.apply({"link_kind": "employer", "group_size": 600,
                                   "tenure_on_credit_file": True},
                                  loan_ids=["L2", "L3"], source={"kind": "graph", "edge_id": "e1"})
            self.assertEqual(applied["rule_id"], "R-001")
            self.assertTrue(applied["ruled_at"])
            self.assertEqual(events[-1][0], "rule_applied")
            self.assertEqual(events[-1][1]["source"]["edge_id"], "e1")
            self.assertEqual([event[0] for event in events],
                             ["question_asked", "question_answered", "question_answered",
                              "rule_applied"])
            self.assertEqual(events[-1][1]["then"], "explain_link")
            in_scope = store.ask_human(
                run_id="run-2", loan_id="L4", question="Should this be cleared?",
                topic="shared_employer", reason="sources disagree",
                context={"link_kind": "employer", "group_size": 700,
                         "tenure_on_credit_file": True},
            )
            out_of_scope = store.ask_human(
                run_id="run-3", loan_id="L5", question="Can this smaller employer be explained?",
                topic="shared_employer", reason="no precedent",
                context={"link_kind": "employer", "group_size": 40,
                         "tenure_on_credit_file": True},
            )
            self.assertTrue(in_scope["already_resolved_by_rule"])
            self.assertEqual(out_of_scope["id"], "q-002")

    def test_rule_revisions_are_versioned_and_demo_reset_clears_memory(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = RuleMemory(tmp)
            q1 = store.ask_human(run_id="r1", loan_id="L1", question="Rule?", topic="policy",
                                 reason="no precedent", context={"link_kind": "employer",
                                                                 "group_size": 800})
            store.answer_question(q1["id"], answer="Explain large employer links.",
                                  answered_by="CRO", when={"link_kind": "employer",
                                                           "min_group_size": 800})
            store.confirm_rule(q1["id"], confirmed_by="CRO")
            q2 = store.ask_human(run_id="r2", loan_id="L2", question="Review rule?", topic="policy",
                                 reason="sources disagree", context={"link_kind": "employer",
                                                                     "group_size": 500})
            store.answer_question(q2["id"], answer="Tenure is also required.",
                                  answered_by="CRO", when={"link_kind": "employer",
                                                           "tenure_on_credit_file": True},
                                  rule_id="R-001")
            revised = store.confirm_rule(q2["id"], confirmed_by="CRO")
            self.assertEqual(revised["version"], 2)
            self.assertTrue((Path(tmp) / "history" / "R-001-v001.yaml").exists())
            store.reset()
            self.assertEqual(store.rules(), [])
            self.assertEqual(store.pending_questions(), [])

    def test_topic_routing_covers_fraud_alert_credit_legal_and_compliance(self):
        self.assertEqual(RuleMemory.route("fraud_alert"), "CRO")
        self.assertEqual(RuleMemory.route("bureau_disagreement"), "credit analyst")
        self.assertEqual(RuleMemory.route("buyback"), "legal")
        self.assertEqual(RuleMemory.route("sanctions"), "compliance")


if __name__ == "__main__":
    unittest.main()
