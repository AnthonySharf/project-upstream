"""
main.py — FastAPI application for Project Upstream.
Serves facility data, estimates, demographics, and EPA compliance records.

Usage:
    uvicorn main:app --reload
"""

from typing import Any, Optional
import json
import os
import traceback

import httpx
from openai import OpenAI
from tavily import TavilyClient
from database import CountyBrief
from datetime import datetime

from openai import OpenAI
from tavily import TavilyClient
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)

import os

GOOGLE_CIVIC_API_KEY = os.getenv("GOOGLE_CIVIC_API_KEY")


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
    allow_origins=[
        "http://localhost:5173",
        "https://project-upstream.netlify.app",
    ],
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


@app.get("/county-brief")
async def get_county_brief(lat: float, lon: float, county: str, state: str):
    with Session(engine) as session:
        # Check cache first
        cached = session.query(CountyBrief).filter_by(county=county, state=state).first()
        if cached:
            return cached.data

        # Three targeted Tavily searches
        water_results = tavily_client.search(
            query=f"{county} County {state} water utility district data center water consumption permit 2025 2026",
            max_results=5
        )
        electric_results = tavily_client.search(
            query=f"{county} County {state} electric utility grid capacity transmission data center 2025 2026",
            max_results=5
        )
        legislative_results = tavily_client.search(
            query=f"{county} County {state} data center bill legislation moratorium water electricity zoning 2025 2026",
            max_results=5
        )

        print("WATER:", [r["content"][:200] for r in water_results["results"]])
        print("ELECTRIC:", [r["content"][:200] for r in electric_results["results"]])
        print("LEGISLATIVE:", [r["content"][:200] for r in legislative_results["results"]])

        context = f"""WATER:
{" ".join([r["content"] for r in water_results["results"]])}

ELECTRIC:
{" ".join([r["content"] for r in electric_results["results"]])}

LEGISLATIVE:
{" ".join([r["content"] for r in legislative_results["results"]])}"""

        prompt = f"""You are researching {county} County, {state} for a civic tool helping residents respond to data center development.

Research context:
{context}

Using ONLY the research context above, return this JSON. Return ONLY valid JSON, no preamble or markdown.

{{
  "water": {{
    "header": "Water Infrastructure",
    "points": ["3 most important facts about local water supply as it relates to data center development"]
  }},
  "electric": {{
    "header": "Electric Infrastructure",
    "points": ["3 most important facts about local electric grid as it relates to data center development"]
  }},
  "legislative": {{
    "header": "State Legislative Context",
    "points": ["3 most important facts about state or county legislation affecting data center development"]
  }}
}}

Rules:
- Only use information explicitly in the research context. If a section has no relevant information, return an empty array.
- Never fabricate names, numbers, dates, or bill numbers.
- Each point should be one specific, factual sentence with at least one named entity.
- Every point must be specific to {county} County or {state}. Discard any information that applies nationally or to other regions.
- Prioritize legislation from {state} or {county} County. If including legislation from another state, explicitly name that state in the point so the reader knows it is not local."""

        response = openai_client.chat.completions.create(
            model="gpt-4o",
            max_tokens=1000,
            messages=[
                {"role": "system", "content": "You are a research assistant. Return only valid JSON, no preamble or markdown."},
                {"role": "user", "content": prompt}
            ]
        )

        clean = response.choices[0].message.content.strip()
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip()

        data = json.loads(clean)

        # Cache result
        brief = CountyBrief(
            county=county,
            state=state,
            data=data,
            is_live=True,
            updated_at=datetime.utcnow()
        )
        session.add(brief)
        session.commit()

        return data

@app.get("/representatives")
async def get_representatives(lat: float, lon: float):
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                "https://v3.openstates.org/people.geo",
                params={"lat": lat, "lng": lon, "include": "offices"},
                headers={"X-API-KEY": os.getenv("OPENSTATES_API_KEY")},
                )
            data = res.json()
            print("OPENSTATES STATUS:", res.status_code)
            print("OPENSTATES RESPONSE:", res.text[:500])
        officials = []
        for person in data.get("results", []):
            email = person.get("email")
            # If email is a URL (contact form), discard it
            if email and email.startswith("http"):
                email = None
            phone = None
            for office in person.get("offices", []):
                if office.get("voice") and not phone:
                    phone = office.get("voice")
            officials.append({
                "name": person.get("name"),
                "office": person.get("current_role", {}).get("title"),
                "party": person.get("party"),
                "phone": phone,
                "email": email,
                "url": person.get("openstates_url"),
            })
        return {"officials": officials}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/generate-letter")
async def generate_letter(
    county: str,
    state: str,
    facility_id: Optional[int] = None,
    representative_name: str = "",
    representative_office: str = "",
):
    try:
        facility_context = ""
        if facility_id is not None:
            with Session(engine) as session:
                facility = (
                    session.query(Facility)
                    .options(joinedload(Facility.estimates), joinedload(Facility.demographics))
                    .filter(Facility.id == facility_id)
                    .first()
                )
                if facility:
                    estimate = facility.estimates[0] if facility.estimates else None
                    demo = facility.demographics[0] if facility.demographics else None
                    water_bl = None
                    if estimate and estimate.annual_direct_water_liters:
                        water_bl = round(estimate.annual_direct_water_liters / 1e9, 2)
                    elec_mwh = estimate.annual_electricity_mwh if estimate else None
                    facility_context = f"""
Facility: {facility.name}
Operator: {facility.operator or 'Unknown'}
State: {facility.state}
Status: {facility.status}
Estimated annual water consumption: {water_bl} billion liters
Estimated annual electricity: {elec_mwh} MWh
Tier: {estimate.tier if estimate else 'Unknown'}
Demographics of surrounding census tract:
  Median household income: {demo.median_household_income if demo else 'Unknown'}
  Percent non-white: {float(demo.pct_nonwhite):.1f}% if demo and demo.pct_nonwhite else 'Unknown'
  Percent below poverty: {float(demo.pct_below_poverty):.1f}% if demo and demo.pct_below_poverty else 'Unknown'
"""

        brief_context = ""
        with Session(engine) as session:
            cached = session.query(CountyBrief).filter_by(county=county, state=state).first()
            if cached:
                brief = cached.data
                for section in ["water", "electric", "legislative"]:
                    s = brief.get(section)
                    if s:
                        brief_context += f"\n{s['header']}:\n"
                        for pt in (s.get("points") or []):
                            if pt:
                                brief_context += f"- {pt}\n"

        addressee = f"{representative_name}, {representative_office}" if representative_name else "Elected Official"

        prompt = f"""Write a formal public comment letter from a concerned resident of {county} County, {state} about data center development and its impact on local water and energy resources.

{"Facility context:" + facility_context if facility_context else "This is a general letter about data center development in the county, not tied to a specific facility."}

{"County intelligence brief:" + brief_context if brief_context else ""}

The letter should:
- Open with "Dear {addressee},"
- State the resident's concern clearly in the first paragraph
- Cite specific water and energy figures if facility context is provided
- Reference county-specific infrastructure or legislative context if available
- Close with a specific ask: demand public disclosure of water and energy consumption, request a public comment period, and request an environmental impact study
- Be formal, factual, and under 400 words
- End with a signature placeholder: [Your Name], [Your Address]

Return only the letter text. No preamble, no explanation."""

        response = openai_client.chat.completions.create(
            model="gpt-4o",
            max_tokens=800,
            messages=[
                {"role": "system", "content": "You are a civic writing assistant. Write formal public comment letters."},
                {"role": "user", "content": prompt}
            ]
        )

        body = response.choices[0].message.content.strip()
        subject = f"Public Comment: Data Center Development in {county} County"
        if facility_id and facility_context:
            subject = f"Public Comment: {facility.name} — {county} County, {state}"

        return {"subject": subject, "body": body}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/county-briefs/clear")
def clear_briefs():
    with Session(engine) as session:
        session.query(CountyBrief).delete()
        session.commit()
    return {"deleted": True}

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
