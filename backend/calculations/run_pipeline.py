"""
run_pipeline.py — Run the Project Upstream estimation pipeline over all
facilities and persist results to the estimates table.

Usage:
    python backend/calculations/run_pipeline.py
"""

import os
import sys
from collections import Counter

# Resolve backend/ so both sibling imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.orm import Session

from database import Estimate, Facility, engine
from calculations import EstimateResult, run_estimation


def _already_estimated(session: Session, facility_id: int) -> bool:
    return (
        session.query(Estimate.id)
        .filter(Estimate.facility_id == facility_id)
        .first()
        is not None
    )


def _result_to_orm(result: EstimateResult) -> Estimate:
    return Estimate(
        facility_id=result.facility_id,
        annual_electricity_mwh=result.annual_electricity_mwh,
        annual_electricity_low=result.annual_electricity_low,
        annual_electricity_high=result.annual_electricity_high,
        annual_direct_water_liters=result.annual_direct_water_liters,
        annual_direct_water_low=result.annual_direct_water_low,
        annual_direct_water_high=result.annual_direct_water_high,
        annual_indirect_water_m3=result.annual_indirect_water_m3,
        pue_estimate=result.pue_estimate,
        pue_low=result.pue_low,
        pue_high=result.pue_high,
        wue_estimate=result.wue_estimate,
        wue_low=result.wue_low,
        wue_high=result.wue_high,
        tier=result.tier,
    )


def run_pipeline() -> None:
    tier_counts: Counter = Counter()
    skipped = 0
    errors = 0
    processed = 0

    with Session(engine) as session:
        facilities = session.query(Facility).all()
        total = len(facilities)
        print(f"Found {total} facilities.")

        for facility in facilities:
            # Skip facilities that already have an estimate
            if _already_estimated(session, facility.id):
                skipped += 1
                continue

            try:
                result = run_estimation(facility)
                estimate = _result_to_orm(result)
                session.add(estimate)
                session.commit()
                tier_counts[result.tier] += 1
            except Exception as exc:
                session.rollback()
                errors += 1
                print(f"  ERROR facility {facility.id} ({facility.name}): {exc}")
                continue

            processed += 1
            if processed % 100 == 0:
                done = skipped + processed + errors
                print(
                    f"  Progress: {done}/{total} reviewed — "
                    f"{processed} estimated, {skipped} skipped, {errors} errors"
                )

    # Final summary
    total_done = skipped + processed + errors
    print(f"\nPipeline complete — {total_done}/{total} facilities reviewed.")
    print(f"  Estimated : {processed}")
    print(f"  Skipped   : {skipped}  (already had estimate)")
    print(f"  Errors    : {errors}")
    print("\nEstimates by tier:")
    for tier in ("1", "2", "3", "unestimable"):
        count = tier_counts.get(tier, 0)
        print(f"  Tier {tier:<12}: {count}")


if __name__ == "__main__":
    run_pipeline()
