"""
fractracker_fetch.py — Upsert FracTracker data centers into the facilities table.

CSV location (relative to repo root):
    data/raw/Data_Centers_Database - FracTracker Data Centers.csv

Logic:
    - For each row, check whether a facility already exists within 0.01°
      of the record's lat/lon (roughly 1 km at mid-latitudes).
    - Match found  → update mw, cooling_type, status.
    - No match     → insert new record with source="fractracker".
    - Invalid row  → skip and log the reason.

Usage:
    python fractracker_fetch.py [--csv PATH] [--dry-run]

Size classification (facility_size_sqft):
    small    : < 1,000 sqft
    midsize  : 1,000 – 20,000 sqft
    large    : > 20,000 sqft
"""

import argparse
import csv
import re
import sys
from pathlib import Path

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy import and_
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT   = BACKEND_DIR.parent
DEFAULT_CSV = REPO_ROOT / "data" / "raw" / "Data_Centers_Database - FracTracker Data Centers.csv"

sys.path.insert(0, str(BACKEND_DIR))
from database import Facility, engine  # noqa: E402

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SOURCE          = "fractracker"
PROXIMITY_DEG   = 0.01   # ~1 km — threshold for "same facility" dedup

# FracTracker status → our DB enum
STATUS_MAP = {
    "operating":                          "operational",
    "approved/permitted/under construction": "under_construction",
    "expanding":                          "operational",
    "proposed":                           "under_construction",
    "cancelled":                          "decommissioned",
    "suspended":                          "decommissioned",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def classify_size(sqft: float) -> str:
    if sqft < 1_000:
        return "small"
    if sqft <= 20_000:
        return "midsize"
    return "large"


def parse_float(value: str, field: str):
    """Strip commas/spaces, return float or None. Warns on bad format."""
    v = value.strip().replace(",", "")
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        print(f"  [WARN] Cannot parse {field}={value!r} as float — treating as null")
        return None


def parse_mw(value: str) -> "float | None":
    """
    Parse MW field which may be:
      - plain number:      "240"
      - range (hyphen):    "100-200", "150-1,000", "0-.4"
      - range (en-dash):   "12–20"
      - trailing + or ?:   "50+", "70?"  → treat as lower bound
      - empty:             ""

    Ranges → average of the two bounds.
    """
    # normalise: remove commas, strip spaces, unify en-dash → hyphen
    v = value.strip().replace(",", "").replace("\u2013", "-").replace("\u2014", "-")
    if not v:
        return None

    # strip trailing uncertainty markers before further parsing
    v_clean = v.rstrip("+?")

    # range: two non-negative numbers separated by a hyphen
    m = re.match(r'^([\d.]+)-([\d.]+)$', v_clean)
    if m:
        try:
            lo, hi = float(m.group(1)), float(m.group(2))
            return (lo + hi) / 2.0
        except ValueError:
            pass

    try:
        return float(v_clean)
    except ValueError:
        print(f"  [WARN] Cannot parse mw={value!r} as float — treating as null")
        return None


def normalize_status(value: str) -> str:
    return STATUS_MAP.get(value.strip().lower(), "unknown")


def build_record(row: dict) -> "tuple[dict | None, str | None]":
    """
    Parse one CSV row into a plain dict of field values.

    Returns (record_dict, None) on success.
    Returns (None, reason) when the row must be skipped.
    """
    lat = parse_float(row["lat"],  "lat")
    lon = parse_float(row["long"], "long")

    if lat is None or lon is None:
        return None, "missing lat/lon"
    if lat == 0.0 and lon == 0.0:
        return None, "lat/lon are 0,0 (ungeocoded)"

    sqft       = parse_float(row["facility_size_sqft"], "facility_size_sqft")
    size_class = classify_size(sqft) if sqft is not None else None

    return {
        "name"         : row["facility_name"].strip() or None,
        "operator"     : row["operator_name"].strip() or None,
        "address"      : row["address"].strip() or None,
        "city"         : row["city"].strip() or None,
        "state"        : row["state"].strip() or None,
        "county"       : row["county"].strip() or None,
        "lat"          : lat,
        "lon"          : lon,
        "sqft"         : sqft,
        "mw"           : parse_mw(row["mw"]),
        "cooling_type" : row["cooling_type"].strip() or None,
        "status"       : normalize_status(row["status"]),
        "size_class"   : size_class,
        "facility_type": None,   # FracTracker has no equivalent field
        "source"       : SOURCE,
    }, None


def find_nearby(session: Session, lat: float, lon: float) -> "Facility | None":
    """Return first facility whose lat/lon is within PROXIMITY_DEG of the given point."""
    return (
        session.query(Facility)
        .filter(
            and_(
                Facility.lat >= lat - PROXIMITY_DEG,
                Facility.lat <= lat + PROXIMITY_DEG,
                Facility.lon >= lon - PROXIMITY_DEG,
                Facility.lon <= lon + PROXIMITY_DEG,
            )
        )
        .first()
    )


# ---------------------------------------------------------------------------
# Main upsert logic
# ---------------------------------------------------------------------------

def upsert(csv_path: Path, dry_run: bool = False) -> None:
    if not csv_path.exists():
        print(f"[ERROR] CSV not found: {csv_path}")
        sys.exit(1)

    records  : list[dict] = []
    skipped  : int = 0
    skip_log : list[tuple[int, str, str]] = []

    print(f"Reading {csv_path} ...")
    with csv_path.open(newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for line_num, row in enumerate(reader, start=2):
            record, reason = build_record(row)
            if record is None:
                skipped += 1
                skip_log.append((line_num, row.get("facility_name", "?"), reason))
            else:
                records.append(record)

    # report skipped rows
    if skip_log:
        print(f"\nSkipped rows ({skipped}):")
        for line_num, name, reason in skip_log:
            print(f"  line {line_num:>4}  name={name!r}  reason={reason}")

    if dry_run:
        print(f"\n[DRY RUN] {len(records)} parseable rows, {skipped} skipped.")
        _print_summary(records, 0, 0, skipped, dry_run=True)
        return

    inserted = 0
    updated  = 0

    print(f"\nUpserting {len(records)} records ...")
    with Session(engine) as session:
        try:
            for rec in records:
                existing = find_nearby(session, rec["lat"], rec["lon"])
                if existing:
                    # update only the fields FracTracker adds that PNNL lacks
                    if rec["mw"] is not None:
                        existing.mw = rec["mw"]
                    if rec["cooling_type"] is not None:
                        existing.cooling_type = rec["cooling_type"]
                    if rec["status"] != "unknown":
                        existing.status = rec["status"]
                    updated += 1
                else:
                    location = from_shape(Point(rec["lon"], rec["lat"]), srid=4326)
                    facility = Facility(
                        name          = rec["name"],
                        operator      = rec["operator"],
                        address       = rec["address"],
                        city          = rec["city"],
                        state         = rec["state"],
                        county        = rec["county"],
                        lat           = rec["lat"],
                        lon           = rec["lon"],
                        location      = location,
                        sqft          = rec["sqft"],
                        mw            = rec["mw"],
                        cooling_type  = rec["cooling_type"],
                        status        = rec["status"],
                        size_class    = rec["size_class"],
                        facility_type = rec["facility_type"],
                        source        = SOURCE,
                    )
                    session.add(facility)
                    inserted += 1

            session.commit()
        except Exception as exc:
            session.rollback()
            print(f"[ERROR] DB upsert failed: {exc}")
            sys.exit(1)

    _print_summary(records, inserted, updated, skipped)


def _print_summary(
    records: list,
    inserted: int,
    updated: int,
    skipped: int,
    dry_run: bool = False,
) -> None:
    size_counts = {"small": 0, "midsize": 0, "large": 0, "unknown": 0}
    for r in records:
        size_counts[r["size_class"] or "unknown"] += 1

    status_counts: dict[str, int] = {}
    for r in records:
        status_counts[r["status"]] = status_counts.get(r["status"], 0) + 1

    prefix = "[DRY RUN] " if dry_run else ""
    print(f"\n--- {prefix}Upsert summary ---")
    if dry_run:
        print(f"  Parseable: {len(records)}")
    else:
        print(f"  Inserted : {inserted}")
        print(f"  Updated  : {updated}")
    print(f"  Skipped  : {skipped}")
    print("  Size breakdown (parseable rows):")
    for cls in ("small", "midsize", "large", "unknown"):
        print(f"    {cls:<10}: {size_counts[cls]}")
    print("  Status breakdown (parseable rows):")
    for st, count in sorted(status_counts.items()):
        print(f"    {st:<25}: {count}")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Upsert FracTracker data centers into the facilities table"
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV,
        help=f"Path to FracTracker CSV (default: {DEFAULT_CSV})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and validate without writing to the database",
    )
    args = parser.parse_args()
    upsert(csv_path=args.csv, dry_run=args.dry_run)
