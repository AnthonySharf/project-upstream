"""
api_fetch.py — Fetch EPA ECHO compliance/violation data for every facility
in the facilities table and insert into the epa_compliance table.

Strategy per facility:
  1. Search ECHO by facility name + state  →  QueryID
  2. Download CSV (fresh QueryID each time)  →  per-program compliance rows
  3. Fuzzy-match best ECHO result to our facility by name
  4. Emit one EPACompliance row per program that has a non-empty status

ECHO columns used:
  FacName, FacState, RegistryID
  CAAComplianceStatus / CWAComplianceStatus / RCRAComplianceStatus / SDWAComplianceStatus
  CAAFormalActionCount / CWAFormalActionCount / RCRAFormalActionCount / SDWAFormalActionCount
  CAAPenalties / CWAPenalties / RCRAPenalties
  CAALastPenaltyDate / CWALastPenaltyDate / RCRALastPenaltyDate
  CAADateLastFormalAction / CWADateLastFormalAction / RCRADateLastFormalAction

Usage:
    python api_fetch.py [--limit N] [--dry-run]
"""

import argparse
import csv
import io
import re
import sys
import time
from datetime import date, datetime
from difflib import SequenceMatcher
from pathlib import Path

import requests
from dotenv import load_dotenv
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

from database import EPACompliance, Facility, engine  # noqa: E402

# ---------------------------------------------------------------------------
# ECHO API config
# ---------------------------------------------------------------------------
ECHO_SEARCH_URL   = "https://echodata.epa.gov/echo/echo_rest_services.get_facilities"
ECHO_DOWNLOAD_URL = "https://echodata.epa.gov/echo/echo_rest_services.get_download"

# qcolumns IDs:
#   1-6   = name/address/state/zip/registryID
#   37-40 = compliance status per program (CAA/CWA/RCRA/SDWA)
#   56-59 = formal action counts
#   60-66 = overall penalty fields
#   107-109 = CAA penalty date/amount/action date
#   116-118 = CWA
#   125-127 = RCRA
QCOLUMNS = "1,2,3,4,5,6,37,38,39,40,56,57,58,59,60,61,62,63,64,65,66,107,108,109,116,117,118,125,126,127"

RATE_DELAY           = 0.5   # seconds between API calls
RETRY_WAIT           = 2.0   # seconds before retry
MAX_RETRIES          = 3
REQUEST_TIMEOUT      = 20    # seconds
PROGRESS_N           = 50
NAME_MATCH_THRESHOLD = 0.40  # minimum SequenceMatcher ratio to accept

PROGRAMS = ("CAA", "CWA", "RCRA", "SDWA")

PROGRAM_FIELDS = {
    "CAA": {
        "status":         "CAAComplianceStatus",
        "formal_actions": "CAAFormalActionCount",
        "penalty_amt":    "CAAPenalties",
        "penalty_date":   "CAALastPenaltyDate",
    },
    "CWA": {
        "status":         "CWAComplianceStatus",
        "formal_actions": "CWAFormalActionCount",
        "penalty_amt":    "CWAPenalties",
        "penalty_date":   "CWALastPenaltyDate",
    },
    "RCRA": {
        "status":         "RCRAComplianceStatus",
        "formal_actions": "RCRAFormalActionCount",
        "penalty_amt":    "RCRAPenalties",
        "penalty_date":   "RCRALastPenaltyDate",
    },
    "SDWA": {
        "status":         "SDWAComplianceStatus",
        "formal_actions": "SDWAFormalActionCount",
        "penalty_amt":    None,   # no separate SDWA penalty column in ECHO
        "penalty_date":   None,
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize(name: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", name.lower())).strip()


def _name_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize(a), _normalize(b)).ratio()


def _parse_date(value: str) -> "date | None":
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except (ValueError, AttributeError):
            continue
    return None


def _parse_dollars(value: str) -> "float | None":
    v = value.strip().replace(",", "").lstrip("$") if value else ""
    if not v:
        return None
    try:
        x = float(v)
        return x if x > 0 else None
    except ValueError:
        return None


def _get_with_retry(url: str, params: dict) -> "requests.Response | None":
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            return resp
        except Exception as exc:
            if attempt < MAX_RETRIES:
                print(f"    [WARN] Attempt {attempt}/{MAX_RETRIES} failed: {exc} — retry in {RETRY_WAIT}s")
                time.sleep(RETRY_WAIT)
            else:
                print(f"    [WARN] All {MAX_RETRIES} attempts failed: {exc}")
    return None


# ---------------------------------------------------------------------------
# Step 1 — Two-step ECHO search: name + state → CSV rows
# ---------------------------------------------------------------------------

def search_echo(name: str, state: str) -> list:
    """
    Returns list of dicts from ECHO CSV download, or [] on any failure.
    Makes two API calls: get_facilities (→ QueryID) then get_download (→ CSV).
    """
    # a) search
    time.sleep(RATE_DELAY)
    resp = _get_with_retry(ECHO_SEARCH_URL, {"output": "JSON", "p_fn": name, "p_st": state})
    if resp is None:
        return []

    try:
        result = resp.json().get("Results", {})
        qid    = result.get("QueryID")
        n_rows = int(result.get("QueryRows", 0))
    except Exception:
        return []

    if not qid or n_rows == 0:
        return []

    # b) download CSV
    time.sleep(RATE_DELAY)
    resp2 = _get_with_retry(ECHO_DOWNLOAD_URL, {"output": "CSV", "qid": qid, "qcolumns": QCOLUMNS})
    if resp2 is None:
        return []

    try:
        return list(csv.DictReader(io.StringIO(resp2.text)))
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Step 2 — Fuzzy-match best ECHO row to facility
# ---------------------------------------------------------------------------

def best_match(facility_name: str, echo_rows: list) -> "dict | None":
    best_score = 0.0
    best_row   = None
    for row in echo_rows:
        score = _name_similarity(facility_name, row.get("FacName", ""))
        if score > best_score:
            best_score = score
            best_row   = row
    return best_row if best_score >= NAME_MATCH_THRESHOLD else None


# ---------------------------------------------------------------------------
# Step 3 — Build EPACompliance rows from matched ECHO row
# ---------------------------------------------------------------------------

def build_compliance_rows(facility_id: int, echo_row: dict) -> list:
    """One EPACompliance row per program with a non-empty compliance status."""
    rows = []
    for program, fields in PROGRAM_FIELDS.items():
        status = echo_row.get(fields["status"], "").strip()
        if not status:
            continue

        formal_count = echo_row.get(fields["formal_actions"], "").strip()
        penalty_amt  = _parse_dollars(echo_row.get(fields["penalty_amt"] or "", ""))
        violation_dt = _parse_date(echo_row.get(fields["penalty_date"] or "", ""))

        enforcement = status
        if formal_count and formal_count not in ("", "0"):
            enforcement = f"{status}; {formal_count} formal action(s)"

        rows.append(EPACompliance(
            facility_id        = facility_id,
            violation_type     = status,
            violation_date     = violation_dt,
            enforcement_action = enforcement,
            penalty_amount     = penalty_amt,
            program            = program,
        ))
    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(limit: int = None, dry_run: bool = False) -> None:
    with Session(engine) as session:
        query = session.query(Facility).filter(
            Facility.name.isnot(None),
            Facility.state.isnot(None),
        )
        if limit:
            query = query.limit(limit)
        facilities = query.all()

    total          = len(facilities)
    compliance_rows: list = []
    n_matched      = 0
    n_no_results   = 0
    n_no_match     = 0
    n_api_error    = 0

    print(f"Processing {total} facilities ...")
    if dry_run:
        print("[DRY RUN] No DB writes.\n")

    for i, facility in enumerate(facilities, start=1):
        if i % PROGRESS_N == 0 or i == total:
            print(
                f"  [{i:>5}/{total}]  "
                f"matched={n_matched}  "
                f"no_echo={n_no_results}  "
                f"no_match={n_no_match}  "
                f"api_err={n_api_error}  "
                f"rows={len(compliance_rows)}"
            )

        echo_rows = search_echo(facility.name, facility.state)

        if echo_rows is None:   # shouldn't happen but guard anyway
            n_api_error += 1
            continue
        if len(echo_rows) == 0:
            n_no_results += 1
            continue

        match = best_match(facility.name, echo_rows)
        if match is None:
            n_no_match += 1
            continue

        new_rows = build_compliance_rows(facility.id, match)
        compliance_rows.extend(new_rows)
        n_matched += 1

    if not dry_run and compliance_rows:
        print(f"\nInserting {len(compliance_rows)} compliance rows ...")
        with Session(engine) as session:
            try:
                session.add_all(compliance_rows)
                session.commit()
            except Exception as exc:
                session.rollback()
                print(f"[ERROR] DB insert failed: {exc}")
                sys.exit(1)

    _print_summary(total, len(compliance_rows), n_matched, n_no_results, n_no_match, n_api_error, dry_run)


def _print_summary(total, n_rows, n_matched, n_no_results, n_no_match, n_api_err, dry_run):
    label = "Would insert" if dry_run else "Inserted    "
    print("\n--- EPA ECHO fetch summary ---")
    print(f"  Facilities processed      : {total}")
    print(f"  Facilities matched        : {n_matched}")
    print(f"  {label} compliance rows  : {n_rows}")
    print(f"  No ECHO results (search)  : {n_no_results}")
    print(f"  No name match found       : {n_no_match}")
    print(f"  API errors                : {n_api_err}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Fetch EPA ECHO compliance data for all facilities"
    )
    parser.add_argument("--limit", type=int, default=None,
                        help="Process only first N facilities (for testing)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch and parse without writing to the database")
    args = parser.parse_args()
    run(limit=args.limit, dry_run=args.dry_run)
