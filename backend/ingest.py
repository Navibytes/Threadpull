"""Load the messy loan tape and normalize it into clean loan records.

Reads data/out/seed<N>/ only. Ground truth lives outside data/out and backend code never opens it.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path

DATA_OUT = Path(__file__).resolve().parent.parent / "data" / "out"
INITIAL_STATUS = "Not reviewed"

STATES = {"ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR", "CALIFORNIA": "CA",
          "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE", "FLORIDA": "FL", "GEORGIA": "GA",
          "HAWAII": "HI", "IDAHO": "ID", "ILLINOIS": "IL", "INDIANA": "IN", "IOWA": "IA", "KANSAS": "KS",
          "KENTUCKY": "KY", "LOUISIANA": "LA", "MAINE": "ME", "MARYLAND": "MD", "MASSACHUSETTS": "MA",
          "MICHIGAN": "MI", "MINNESOTA": "MN", "MISSISSIPPI": "MS", "MISSOURI": "MO", "MONTANA": "MT",
          "NEBRASKA": "NE", "NEVADA": "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM",
          "NEW YORK": "NY", "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH", "OKLAHOMA": "OK",
          "OREGON": "OR", "PENNSYLVANIA": "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
          "SOUTH DAKOTA": "SD", "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT", "VERMONT": "VT",
          "VIRGINIA": "VA", "WASHINGTON": "WA", "WEST VIRGINIA": "WV", "WISCONSIN": "WI", "WYOMING": "WY"}
DOB_FORMATS = ["%Y-%m-%d", "%m/%d/%Y", "%d-%b-%Y", "%Y%m%d"]
TS_FORMATS = ["%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M", "%m/%d/%Y %I:%M %p"]
UNIT_RE = re.compile(r"\s+(APT|UNIT|STE|FL|#)\s*\S+$")


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def _upper(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip()).upper()


def _parse(s: str, formats: list[str]) -> datetime:
    for f in formats:
        try:
            return datetime.strptime(s.strip(), f)
        except ValueError:
            pass
    raise ValueError(f"unrecognized date {s!r}")


def _money(v) -> float:
    return float(str(v).replace("$", "").replace(",", "").replace("%", "").strip())


def normalize_name(first: str, last: str) -> tuple[str, str]:
    first, last = _upper(first), _upper(last)
    if not last and "," in first:
        last, first = (p.strip() for p in first.split(",", 1))
    return first, last


def normalize_phone(p: str) -> str:
    d = _digits(p)
    return d[1:] if len(d) == 11 and d.startswith("1") else d


def address_key(street: str, zip_code: str) -> str:
    """Building-level key: street without the unit, plus ZIP. Used to link shared buildings."""
    return f"{UNIT_RE.sub('', _upper(street))}|{zip_code}"


def normalize_loan(raw: dict) -> dict:
    ln = dict(raw)
    ln["first_name"], ln["last_name"] = normalize_name(raw["first_name"], raw["last_name"])
    ln["dob"] = _parse(raw["dob"], DOB_FORMATS).date().isoformat()
    ln["ssn"] = _digits(raw["ssn"])
    ln["phone"] = normalize_phone(raw["phone"])
    ln["email"] = raw["email"].strip().lower()
    ln["address"], ln["city"] = _upper(raw["address"]), _upper(raw["city"])
    st = _upper(raw["state"])
    ln["state"] = STATES.get(st, st)
    ln["zip"] = raw["zip"].strip()[:5]
    ln["address_key"] = address_key(ln["address"], ln["zip"])
    ln["application_ts"] = _parse(raw["application_ts"], TS_FORMATS).strftime("%Y-%m-%dT%H:%M:00Z")
    for f in ("amount_financed", "apr", "monthly_payment", "current_balance", "purchase_price",
              "stated_income_monthly"):
        ln[f] = _money(raw[f])
    ln["co_applicant_name"] = _upper(raw["co_applicant_name"]) if raw["co_applicant_name"] else None
    ln["dealer_name_raw"] = raw["dealer_name"]
    ln["status"] = INITIAL_STATUS
    return ln


@lru_cache(maxsize=8)
def load_portfolio(seed: int = 13) -> tuple[dict, ...]:
    path = DATA_OUT / f"seed{seed}" / "loans.json"
    if not path.exists():
        raise FileNotFoundError(f"{path} missing: run `uv run python -m data.generate`")
    loans = [normalize_loan(r) for r in json.loads(path.read_text())]
    # one canonical dealer name per dealer_id (the tape spells each dealer three ways)
    spellings: dict[str, set[str]] = {}
    for ln in loans:
        spellings.setdefault(ln["dealer_id"], set()).add(ln["dealer_name_raw"])
    canonical = {d: canonical_dealer_name(v) for d, v in spellings.items()}
    for ln in loans:
        ln["dealer_name"] = canonical[ln["dealer_id"]]
    return tuple(loans)


def canonical_dealer_name(spellings: set[str]) -> str:
    """Pick the unabbreviated spelling: drop a trailing LLC, prefer the longest, upper-case it."""
    cleaned = {re.sub(r"\s+LLC$", "", _upper(s)) for s in spellings}
    return max(sorted(cleaned), key=len)


@lru_cache(maxsize=8)
def load_reference(seed: int = 13) -> dict:
    """Simulated public lookups (address type, employer headcount)."""
    return json.loads((DATA_OUT / f"seed{seed}" / "reference" / "public_lookups.json").read_text())
