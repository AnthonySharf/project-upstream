"""
api_fetch.py — Ingest PNNL IM3 Data Center Atlas CSV into facilities table.

CSV location (relative to repo root):
    data/raw/im3_open_source_data_center_atlas.csv

Usage:
    python api_fetch.py [--csv PATH] [--dry-run]

Size classification (sqft):
    small    : < 1,000 sqft
    midsize  : 1,000 – 20,000 sqft
    large    : > 20,000 sqft
"""

import argparse
import csv
import sys
from pathlib import Path

from geoalchemy2.shape import from_shape
from shapely.geometry import Point
from sqlalchemy.orm import Session

# ---------------------------------------------------------------------------
# Resolve paths so the script runs from any working directory
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent.parent   # backend/
REPO_ROOT   = BACKEND_DIR.parent                       # project root
DEFAULT_CSV = REPO_ROOT / "data" / "raw" / "im3_open_source_data_center_atlas.csv"

sys.path.insert(0, str(BACKEND_DIR))
from database import Facility, engine  # noqa: E402  (import after sys.path patch)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
SOURCE = "pnnl_atlas"


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
    """Return float or None; warn on malformed input."""
    v = value.strip()
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        print(f"  [WARN] Cannot parse {field}={value!r} as float — treating as null")
        return None


def build_facility(row: dict):
    """
    Parse one CSV row into a Facility ORM object.

    Returns (Facility, None) on success.
    Returns (None, reason) when the row must be skipped.
    """
    # required: lat / lon — without these we cannot place the facility
    lat = parse_float(row["lat"], "lat")
    lon = parse_float(row["lon"], "lon")
    if lat is None or lon is None:
        return None, "missing lat/lon"

    # name: fall back to atlas ID when blank
    name = row["name"].strip() or row["id"].strip()

    sqft       = parse_float(row["sqft"], "sqft")
    size_class = classify_size(sqft) if sqft is not None else None

    # CSV 'type' → facility_type (building / campus / point)
    facility_type = row.get("type", "").strip() or None

    state    = row.get("state_abb", "").strip() or None
    location = from_shape(Point(lon, lat), srid=4326)

    return Facility(
        name          = name,
        operator      = row["operator"].strip() or None,
        address       = None,       # not in atlas CSV
        city          = None,       # not in atlas CSV
        state         = state,
        county        = row["county"].strip() or None,
        lat           = lat,
        lon           = lon,
        location      = location,
        sqft          = sqft,
        mw            = None,       # not in atlas CSV
        cooling_type  = None,       # not in atlas CSV
        status        = "unknown",  # atlas does not provide operational status
        size_class    = size_class,
        facility_type = facility_type,
        source        = SOURCE,
    ), None


# ---------------------------------------------------------------------------
# Main ingestion logic
# ---------------------------------------------------------------------------

def ingest(csv_path: Path, dry_run: bool = False) -> None:
    if not csv_path.exists():
        print(f"[ERROR] CSV not found: {csv_path}")
        sys.exit(1)

    facilities = []
    skipped    = 0
    skip_log   = []  # (line_num, atlas_id, reason)

    print(f"Reading {csv_path} ...")
    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for line_num, row in enumerate(reader, start=2):   # row 2 = first data line
            facility, reason = build_facility(row)
            if facility is None:
                skipped += 1
                skip_log.append((line_num, row.get("id", "?"), reason))
            else:
                facilities.append(facility)

    inserted = len(facilities)

    # report skipped rows before any DB work
    if skip_log:
        print(f"\nSkipped rows ({skipped}):")
        for line_num, atlas_id, reason in skip_log:
            print(f"  line {line_num:>4}  id={atlas_id}  reason={reason}")

    # Collect size_class values now, while objects are plain Python (not yet
    # bound to a session).  Accessing ORM attributes after session.close()
    # raises DetachedInstanceError, so we snapshot here in both paths.
    size_classes = [f.size_class for f in facilities]

    if dry_run:
        print(f"\n[DRY RUN] Would insert {inserted} records, skip {skipped}.")
        _print_summary(size_classes, inserted, skipped)
        return

    print(f"\nInserting {inserted} records into facilities table ...")
    with Session(engine) as session:
        try:
            session.add_all(facilities)
            session.commit()
        except Exception as exc:
            session.rollback()
            print(f"[ERROR] DB insert failed: {exc}")
            sys.exit(1)

    _print_summary(size_classes, inserted, skipped)


def _print_summary(size_classes: list, inserted: int, skipped: int) -> None:
    size_counts = {"small": 0, "midsize": 0, "large": 0, "unknown": 0}
    for sc in size_classes:
        size_counts[sc or "unknown"] += 1

    print("\n--- Ingest summary ---")
    print(f"  Inserted : {inserted}")
    print(f"  Skipped  : {skipped}")
    print("  Size breakdown:")
    for cls in ("small", "midsize", "large", "unknown"):
        print(f"    {cls:<10}: {size_counts[cls]}")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Ingest PNNL Atlas CSV into the facilities table"
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV,
        help=f"Path to atlas CSV (default: {DEFAULT_CSV})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and validate without writing to the database",
    )
    args = parser.parse_args()
    ingest(csv_path=args.csv, dry_run=args.dry_run)
