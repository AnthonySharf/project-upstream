"""
api_fetch.py — Fetch Census ACS 5-year tract-level demographics for every
facility in the facilities table and insert into the demographics table.

Pipeline per facility:
  1. Census Geocoder API  → convert lat/lon to census tract FIPS
  2. Census ACS 5-yr API  → fetch population/income/race/poverty variables
  3. Derive pct_nonwhite, pct_below_poverty
  4. Insert Demographic row

Variables fetched (ACS 5-year, 2022):
  B01003_001E  total population
  B19013_001E  median household income
  B02001_002E  white alone
  B17001_002E  population below poverty level

Usage:
    python api_fetch.py [--limit N] [--dry-run]
"""

import argparse
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Path / env setup
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

from database import Demographic, Facility, engine  # noqa: E402

CENSUS_API_KEY = os.getenv("CENSUS_API_KEY", "")
if not CENSUS_API_KEY:
    print("[ERROR] CENSUS_API_KEY not set in .env")
    sys.exit(1)

# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------
GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates"
ACS_URL      = "https://api.census.gov/data/2022/acs/acs5"

ACS_VARS = [
    "B01003_001E",  # total population
    "B19013_001E",  # median household income
    "B02001_002E",  # white alone
    "B17001_002E",  # below poverty level
]

RATE_DELAY      = 0.5   # seconds between each API call
RETRY_WAIT      = 2.0   # seconds before geocoder retry
MAX_RETRIES     = 3     # geocoder retry attempts
PROGRESS_N      = 100   # print progress every N facilities
REQUEST_TIMEOUT = 15    # seconds per request


# ---------------------------------------------------------------------------
# Step 1 — Census Geocoder: lat/lon → census tract FIPS
# ---------------------------------------------------------------------------

def geocode_to_tract(lat: float, lon: float):
    """
    Returns dict with keys state, county, tract (zero-padded strings),
    or None on failure. Retries up to MAX_RETRIES times on error.
    """
    params = {
        "x":         lon,
        "y":         lat,
        "benchmark": "Public_AR_Current",
        "vintage":   "Current_Current",
        "layers":    "Census Tracts",
        "format":    "json",
    }
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(GEOCODER_URL, params=params, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            tracts = (
                resp.json()
                    .get("result", {})
                    .get("geographies", {})
                    .get("Census Tracts", [])
            )
            if not tracts:
                return None
            t = tracts[0]
            return {"state": t["STATE"], "county": t["COUNTY"], "tract": t["TRACT"]}
        except Exception as exc:
            if attempt < MAX_RETRIES:
                print(f"    [WARN] Geocoder attempt {attempt}/{MAX_RETRIES} failed ({lat},{lon}): {exc} — retrying in {RETRY_WAIT}s")
                time.sleep(RETRY_WAIT)
            else:
                print(f"    [WARN] Geocoder failed after {MAX_RETRIES} attempts ({lat},{lon}): {exc}")
    return None


# ---------------------------------------------------------------------------
# Step 2 — ACS 5-year: fetch variables for a tract
# ---------------------------------------------------------------------------

def fetch_acs(state: str, county: str, tract: str):
    """
    Returns dict of variable_name → raw_value strings, or None on failure.
    """
    params = {
        "get": ",".join(ACS_VARS),
        "for": f"tract:{tract}",
        "in":  f"state:{state} county:{county}",
        "key": CENSUS_API_KEY,
    }
    try:
        resp = requests.get(ACS_URL, params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        rows = resp.json()
        if len(rows) < 2:
            return None
        return dict(zip(rows[0], rows[1]))
    except Exception as exc:
        print(f"    [WARN] ACS error (tract {state}/{county}/{tract}): {exc}")
        return None


# ---------------------------------------------------------------------------
# Step 3 — parse ACS response → Demographic ORM object
# ---------------------------------------------------------------------------

def _to_int(v):
    try:
        x = int(v)
        return x if x >= 0 else None
    except (TypeError, ValueError):
        return None


def _to_float(v):
    try:
        x = float(v)
        return x if x >= 0 else None   # Census uses -666666666 for suppressed
    except (TypeError, ValueError):
        return None


def parse_acs(acs: dict, facility_id: int, geo: dict):
    """
    Returns a Demographic ORM object, or None when population is
    missing/zero (cannot compute percentage fields).
    """
    population    = _to_int(acs.get("B01003_001E"))
    white_alone   = _to_int(acs.get("B02001_002E"))
    below_poverty = _to_int(acs.get("B17001_002E"))
    median_income = _to_float(acs.get("B19013_001E"))

    if not population:  # None or 0 — skip to avoid division by zero
        return None

    pct_nonwhite = (
        round(((population - white_alone) / population) * 100, 2)
        if white_alone is not None else None
    )
    pct_poverty = (
        round((below_poverty / population) * 100, 2)
        if below_poverty is not None else None
    )

    return Demographic(
        facility_id             = facility_id,
        census_tract_id         = geo["state"] + geo["county"] + geo["tract"],
        population              = population,
        median_household_income = median_income,
        pct_nonwhite            = pct_nonwhite,
        pct_below_poverty       = pct_poverty,
        state                   = geo["state"],
        county                  = geo["county"],
    )


# ---------------------------------------------------------------------------
# Main fetch loop
# ---------------------------------------------------------------------------

def run(limit: int = None, dry_run: bool = False) -> None:
    with Session(engine) as session:
        query = session.query(Facility).filter(
            Facility.lat.isnot(None),
            Facility.lon.isnot(None),
        )
        if limit:
            query = query.limit(limit)
        facilities = query.all()

        existing_ids = {
            row[0]
            for row in session.query(Demographic.facility_id).all()
        }

    total            = len(facilities)
    inserted         = 0
    skip_existing    = 0   # row already in demographics table
    skip_geo         = 0   # geocoder returned no tract
    skip_acs         = 0   # ACS returned no data
    skip_pop         = 0   # zero/missing population

    print(f"Processing {total} facilities ...")
    if dry_run:
        print("[DRY RUN] No DB writes.\n")

    demo_rows: list = []

    for i, facility in enumerate(facilities, start=1):
        if i % PROGRESS_N == 0 or i == total:
            print(
                f"  [{i:>5}/{total}]  "
                f"inserted={inserted}  "
                f"skipped(existing={skip_existing} geo={skip_geo} acs={skip_acs} pop={skip_pop})"
            )

        # skip if already processed
        if facility.id in existing_ids:
            skip_existing += 1
            continue

        # step 1 — geocode
        time.sleep(RATE_DELAY)
        geo = geocode_to_tract(facility.lat, facility.lon)
        if geo is None:
            skip_geo += 1
            continue

        # step 2 — ACS fetch
        time.sleep(RATE_DELAY)
        acs = fetch_acs(geo["state"], geo["county"], geo["tract"])
        if acs is None:
            skip_acs += 1
            continue

        # step 3 — parse
        demo = parse_acs(acs, facility.id, geo)
        if demo is None:
            skip_pop += 1
            continue

        demo_rows.append(demo)
        inserted += 1

    # step 4 — bulk insert
    if not dry_run and demo_rows:
        print(f"\nInserting {len(demo_rows)} demographic rows ...")
        with Session(engine) as session:
            try:
                session.add_all(demo_rows)
                session.commit()
            except Exception as exc:
                session.rollback()
                print(f"[ERROR] DB insert failed: {exc}")
                sys.exit(1)

    _print_summary(total, inserted, skip_existing, skip_geo, skip_acs, skip_pop, dry_run)


def _print_summary(total, inserted, skip_existing, skip_geo, skip_acs, skip_pop, dry_run):
    label = "Would insert" if dry_run else "Inserted"
    print("\n--- Demographics fetch summary ---")
    print(f"  Facilities processed : {total}")
    print(f"  {label:<21}: {inserted}")
    print(f"  Skipped (existing)   : {skip_existing}")
    print(f"  Skipped (no tract)   : {skip_geo}")
    print(f"  Skipped (no ACS)     : {skip_acs}")
    print(f"  Skipped (zero pop)   : {skip_pop}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Fetch Census ACS demographics for all facilities"
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process only first N facilities (useful for testing)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and parse without writing to the database",
    )
    args = parser.parse_args()
    run(limit=args.limit, dry_run=args.dry_run)
