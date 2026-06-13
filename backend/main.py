"""
main.py — FastAPI application for Project Upstream.
Serves facility data, estimates, demographics, and EPA compliance records.

Usage:
    uvicorn main:app --reload
"""

from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload

from database import (
    EPACompliance,
    Estimate,
    Demographic,
    Facility,
    engine,
)

app = FastAPI(title="Project Upstream API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------


def _estimate_fields(estimate: Optional[Estimate]) -> dict[str, Any]:
    if estimate is None:
        return {
            "tier": None,
            "annual_electricity_mwh": None,
            "annual_electricity_low": None,
            "annual_electricity_high": None,
            "annual_direct_water_liters": None,
            "annual_direct_water_low": None,
            "annual_direct_water_high": None,
            "annual_indirect_water_m3": None,
            "annual_total_water_liters": None,
            "pue_estimate": None,
            "pue_low": None,
            "pue_high": None,
            "wue_estimate": None,
            "wue_low": None,
            "wue_high": None,
        }
    indirect_liters = (
        (estimate.annual_indirect_water_m3 * 1000)
        if estimate.annual_indirect_water_m3 is not None
        else None
    )
    direct = estimate.annual_direct_water_liters
    total = (
        (direct + indirect_liters)
        if direct is not None and indirect_liters is not None
        else None
    )
    return {
        "tier": estimate.tier,
        "annual_electricity_mwh": estimate.annual_electricity_mwh,
        "annual_electricity_low": estimate.annual_electricity_low,
        "annual_electricity_high": estimate.annual_electricity_high,
        "annual_direct_water_liters": direct,
        "annual_direct_water_low": estimate.annual_direct_water_low,
        "annual_direct_water_high": estimate.annual_direct_water_high,
        "annual_indirect_water_m3": estimate.annual_indirect_water_m3,
        "annual_total_water_liters": total,
        "pue_estimate": estimate.pue_estimate,
        "pue_low": estimate.pue_low,
        "pue_high": estimate.pue_high,
        "wue_estimate": estimate.wue_estimate,
        "wue_low": estimate.wue_low,
        "wue_high": estimate.wue_high,
    }


def _facility_to_feature(facility: Facility) -> dict[str, Any]:
    estimate = facility.estimates[0] if facility.estimates else None
    props = {
        "id": facility.id,
        "name": facility.name,
        "operator": facility.operator,
        "state": facility.state,
        "status": facility.status,
        "size_class": facility.size_class,
        **_estimate_fields(estimate),
    }
    lat = float(facility.lat) if facility.lat is not None else None
    lon = float(facility.lon) if facility.lon is not None else None
    return {
        "type": "Feature",
        "geometry": (
            {"type": "Point", "coordinates": [lon, lat]}
            if lat is not None and lon is not None
            else None
        ),
        "properties": props,
    }


def _demographic_to_dict(d: Demographic) -> dict[str, Any]:
    return {
        "census_tract_id": d.census_tract_id,
        "state": d.state,
        "county": d.county,
        "population": d.population,
        "median_household_income": (
            float(d.median_household_income)
            if d.median_household_income is not None
            else None
        ),
        "pct_nonwhite": (
            float(d.pct_nonwhite) if d.pct_nonwhite is not None else None
        ),
        "pct_below_poverty": (
            float(d.pct_below_poverty) if d.pct_below_poverty is not None else None
        ),
    }


def _epa_to_dict(e: EPACompliance) -> dict[str, Any]:
    return {
        "id": e.id,
        "program": e.program,
        "violation_type": e.violation_type,
        "violation_date": e.violation_date.isoformat() if e.violation_date else None,
        "enforcement_action": e.enforcement_action,
        "penalty_amount": (
            float(e.penalty_amount) if e.penalty_amount is not None else None
        ),
    }


def _load_facilities(
    session: Session, name_filter: Optional[str] = None
) -> list[Facility]:
    q = session.query(Facility).options(joinedload(Facility.estimates))
    if name_filter:
        pattern = f"%{name_filter}%"
        q = q.filter(
            Facility.name.ilike(pattern) | Facility.operator.ilike(pattern)
        )
    return q.all()


def _to_feature_collection(facilities: list[Facility]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [_facility_to_feature(f) for f in facilities],
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/facilities/search")
def search_facilities(q: str = "") -> dict[str, Any]:
    with Session(engine) as session:
        facilities = _load_facilities(session, name_filter=q)
        return _to_feature_collection(facilities)


@app.get("/facilities")
def get_facilities() -> dict[str, Any]:
    with Session(engine) as session:
        facilities = _load_facilities(session)
        return _to_feature_collection(facilities)


@app.get("/facilities/{facility_id}")
def get_facility(facility_id: int) -> dict[str, Any]:
    with Session(engine) as session:
        facility = (
            session.query(Facility)
            .options(
                joinedload(Facility.estimates),
                joinedload(Facility.demographics),
                joinedload(Facility.epa_compliance),
            )
            .filter(Facility.id == facility_id)
            .first()
        )
        if facility is None:
            raise HTTPException(status_code=404, detail="Facility not found")

        estimate = facility.estimates[0] if facility.estimates else None
        lat = float(facility.lat) if facility.lat is not None else None
        lon = float(facility.lon) if facility.lon is not None else None

        return {
            "id": facility.id,
            "name": facility.name,
            "operator": facility.operator,
            "address": facility.address,
            "city": facility.city,
            "state": facility.state,
            "county": facility.county,
            "lat": lat,
            "lon": lon,
            "sqft": facility.sqft,
            "mw": facility.mw,
            "cooling_type": facility.cooling_type,
            "status": facility.status,
            "size_class": facility.size_class,
            "facility_type": facility.facility_type,
            "source": facility.source,
            **_estimate_fields(estimate),
            "demographics": [_demographic_to_dict(d) for d in facility.demographics],
            "epa_compliance": [_epa_to_dict(e) for e in facility.epa_compliance],
        }
