import unittest

from backend.graph import EvidenceGraph


class EvidenceGraphTests(unittest.TestCase):
    def test_shared_by_nature_weight_is_inverse_pool_count(self):
        graph = EvidenceGraph([
            {"loan_id": "L1", "employer": "North Hospital"},
            {"loan_id": "L2", "employer": "north hospital"},
            {"loan_id": "L3", "employer": "NORTH HOSPITAL"},
        ])
        result = graph.find_connections("L1")["result"]["neighbors"][0]
        self.assertAlmostEqual(result["connections"][0]["weight"], 1 / 3)

    def test_household_phone_link_fades_when_address_and_family_match(self):
        graph = EvidenceGraph([
            {"loan_id": "L1", "first_name": "Alex", "last_name": "Kim",
             "phone": "555-0100", "address": "1 Main St"},
            {"loan_id": "L2", "first_name": "Jamie", "last_name": "Kim",
             "phone": "5550100", "address": "1 Main Street"},
            {"loan_id": "L3", "first_name": "Pat", "last_name": "Lee",
             "phone": "5550100", "address": "9 Pine St"},
        ])
        connections = graph.find_connections("L1")["result"]["neighbors"]
        by_id = {n["loan_id"]: n for n in connections}
        phone_l2 = next(c for c in by_id["L2"]["connections"] if c["kind"] == "phone")
        phone_l3 = next(c for c in by_id["L3"]["connections"] if c["kind"] == "phone")
        self.assertAlmostEqual(phone_l2["weight"], 0.1)
        self.assertAlmostEqual(phone_l3["weight"], 1.0)

    def test_same_origin_is_counted_once_in_priority(self):
        graph = EvidenceGraph([
            {"loan_id": "L1", "submission_id": "S1", "phone": "555-0100",
             "email": "same@example.com"},
            {"loan_id": "L2", "submission_id": "S2", "phone": "5550100",
             "email": "same@example.com"},
        ])
        self.assertAlmostEqual(graph.priority_scores()["L1"], 1.0)
        neighbor = graph.find_connections("L1")["result"]["neighbors"][0]
        self.assertAlmostEqual(neighbor["priority_score"], 1.0)

    def test_find_connections_has_standard_free_tool_envelope(self):
        graph = EvidenceGraph([
            {"loan_id": "L1", "phone": "5550100"},
            {"loan_id": "L2", "phone": "5550100"},
        ])
        result = graph.find_connections("L1")
        self.assertEqual(result["ok"], True)
        self.assertEqual(result["cost"], {"acorns": 0, "unit": "1 graph query"})
        self.assertFalse(result["simulated"])
        neighbor = result["result"]["neighbors"][0]
        self.assertEqual(neighbor["loan_id"], "L2")
        clue = neighbor["connections"][0]
        self.assertEqual(set(("edge_id", "kind", "weight", "sources", "origins", "explained"))
                         - set(clue), set())

    def test_rank_prefers_multiple_rare_links_over_a_common_employer(self):
        loans = [{"loan_id": f"L{i:02}", "employer": "Regional Hospital"}
                 for i in range(1, 11)]
        loans[0].update(phone="555-0100", documents=[{"doc_id": "D1",
                                                        "template_id": "tpl-1"}])
        loans[1].update(phone="5550100", documents=[{"doc_id": "D2",
                                                       "template_id": "tpl-1"}])
        graph = EvidenceGraph(loans)
        self.assertEqual(graph.ranked_leads()[0]["loan_id"], "L01")
        self.assertGreater(graph.priority_scores()["L01"], graph.priority_scores()["L03"])

    def test_zip_alone_never_creates_a_connection(self):
        graph = EvidenceGraph([
            {"loan_id": "L1", "zip": "94103"},
            {"loan_id": "L2", "zip": "94103"},
        ])
        self.assertEqual(graph.find_connections("L1")["result"]["neighbors"], [])

    def test_explained_edge_is_retained_with_zero_weight_and_source(self):
        graph = EvidenceGraph([
            {"loan_id": "L1", "phone": "555-0100"},
            {"loan_id": "L2", "phone": "5550100"},
        ])
        clue = graph.find_connections("L1")["result"]["neighbors"][0]["connections"][0]
        source = {"tool": "check_address", "request_id": "req-1"}
        graph.explain_edge(clue["edge_id"], "The phone is shared by co-borrowers.", source)
        after = graph.find_connections("L1")["result"]["neighbors"]
        self.assertEqual(after, [])
        stored = next(data for _, _, _, data in graph.graph.edges(keys=True, data=True)
                      if data["kind"] == "phone")
        self.assertTrue(stored["explained"])
        self.assertEqual(stored["weight"], 0)
        self.assertEqual(stored["explanation_ref"]["source"], source)


if __name__ == "__main__":
    unittest.main()
