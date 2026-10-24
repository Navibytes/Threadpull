"""Ticket 02: seeded portfolio, normalization and answer-key isolation."""

import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.ingest import load_portfolio
from data.generate import PERSONAS, write

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "data" / "patterns" / "seed13.json"


@pytest.fixture(scope="module")
def generated(tmp_path_factory):
    out, keys = tmp_path_factory.mktemp("out"), tmp_path_factory.mktemp("keys")
    out_dir, key_dir = write(SPEC, out, keys)
    return out_dir, json.loads((key_dir / "answer_key.json").read_text())


@pytest.fixture(scope="module")
def loans():
    write(SPEC, ROOT / "data" / "out", ROOT / "data" / "keys")
    load_portfolio.cache_clear()
    return {ln["loan_id"]: ln for ln in load_portfolio(13)}


def digest(d: Path) -> str:
    return hashlib.sha256(b"".join(p.read_bytes() for p in sorted(d.rglob("*")) if p.is_file())).hexdigest()


def test_same_seed_is_byte_identical(tmp_path, generated):
    out_dir, _ = generated
    again, _ = write(SPEC, tmp_path / "out", tmp_path / "keys")
    assert digest(out_dir) == digest(again)


def test_thousand_loans_with_contract_fields(loans):
    assert len(loans) == 1000
    assert list(loans)[0] == "L0001" and list(loans)[-1] == "L1000"
    for ln in loans.values():
        assert ln["kind"] in ("case", "background")
        assert {d["type"] for d in ln["documents"]} == {"pay_stub", "application"}
        assert ln["status"] == "Not reviewed"


def test_case_loans_match_persona_bodies_exactly(loans):
    case = [ln for ln in loans.values() if ln["kind"] == "case"]
    assert sorted(ln["persona_id"] for ln in case) == sorted(PERSONAS)
    for ln in case:
        p = PERSONAS[ln["persona_id"]]
        assert (ln["first_name"], ln["last_name"], ln["ssn"], ln["dob"], ln["address"], ln["city"],
                ln["state"], ln["zip"], ln["phone"], ln["email"]) == (
            p["first_name"], p["last_name"], p["ssn"], p["dob"], p["street1"], p["city"], p["state"],
            p["zip"], p["phone"], p["email"]), ln["loan_id"]


def test_loan_37_is_the_lead(loans):
    assert loans["L0037"]["persona_id"] == "P13"


def test_tape_is_messy(generated):
    out_dir, _ = generated
    raw = json.loads((out_dir / "loans.json").read_text())
    assert any("," in r["first_name"] for r in raw)
    assert any("-" in r["ssn"] for r in raw) and any("-" not in r["ssn"] for r in raw)
    assert any("/" in r["dob"] for r in raw)
    d03 = {r["dealer_name"] for r in raw if r["dealer_id"] == "D03"}
    assert len(d03) == 3


def test_ring_is_planted(loans, generated):
    _, key = generated
    ring = [loans[i] for i in key["rings"][0]["loan_ids"]]
    assert len(ring) == 6 and {ln["dealer_id"] for ln in ring} == {"D03"}
    assert sorted(ln["persona_id"] for ln in ring if ln["persona_id"]) == ["P12", "P13", "P14"]
    assert {ln["documents"][0]["template_id"] for ln in ring} == {"T-7F3A"}
    template_users = [ln for ln in loans.values() if ln["documents"][0]["template_id"] == "T-7F3A"]
    assert len(template_users) == 6
    phone_13 = [ln for ln in loans.values() if ln["phone"] == loans["L0037"]["phone"]]
    assert len(phone_13) == 2


def test_lookalikes_and_review_cases(loans, generated):
    _, key = generated
    by_expl = {lk["explanation"]: lk["loan_ids"] for lk in key["lookalikes"]}
    building = [loans[i] for i in by_expl["same 212-unit apartment building"]]
    assert len({ln["address_key"] for ln in building}) == 1
    assert len({ln["address"] for ln in building}) == 2
    hospital = by_expl["Meridian Health System employs 48,000"]
    assert len(hospital) == 40
    household = [loans[i] for i in key["lookalikes"][3]["loan_ids"]]
    assert len({(ln["phone"], ln["address"], ln["last_name"]) for ln in household}) == 1
    assert all(ln["co_applicant_name"] for ln in household)
    assert [loans[i]["persona_id"] for rc in key["review_cases"] for i in rc["loan_ids"]] == ["P16", "P15", "P17"]
    assert len(key["dealer_bursts"][0]["loan_ids"]) == 40
    (doc_id,) = key["injected_docs"]
    loan = loans[doc_id.rsplit("-", 1)[0]]
    assert "ignore all prior instructions" in loan["documents"][0]["text"]


def test_backend_never_reads_answer_key():
    for path in (ROOT / "backend").rglob("*.py"):
        text = path.read_text()
        assert "answer_key" not in text and "data/keys" not in text and "keys_root" not in text, path


def test_loans_endpoint():
    r = TestClient(app).get("/loans")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1000 and body[36]["loan_id"] == "L0037" and body[36]["status"] == "Not reviewed"
    assert "documents" not in body[0]
