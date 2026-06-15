"""
database.py — SQLAlchemy models and DB init for Project Upstream.
Tables: facilities, estimates, demographics, epa_compliance
Requires: PostgreSQL + PostGIS extension
"""

import os
from datetime import datetime

from dotenv import load_dotenv
from geoalchemy2 import Geometry
from sqlalchemy import (
    BigInteger,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship

from sqlalchemy import Column, Integer, String, JSON, DateTime, Boolean
from datetime import datetime


load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/upstream",
)

engine = create_engine(DATABASE_URL, echo=False, future=True)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# Table 1: facilities
# ---------------------------------------------------------------------------


class Facility(Base):
    __tablename__ = "facilities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    operator = Column(String(255))
    address = Column(Text)
    city = Column(String(100))
    state = Column(String(2))          # two-letter abbreviation
    county = Column(String(100))
    lat = Column(Numeric(9, 6))
    lon = Column(Numeric(9, 6))
    location = Column(Geometry("POINT", srid=4326))  # PostGIS point
    sqft = Column(Float)               # gross floor area, sq ft
    mw = Column(Float)                 # design capacity, MW
    cooling_type = Column(String(100)) # e.g. air, evaporative, chilled-water
    status = Column(
        Enum("operational", "under_construction", "decommissioned", "unknown",
             name="facility_status"),
    )
    size_class = Column(
        Enum("small", "midsize", "large", name="size_class_enum"),
    )
    facility_type = Column(String(100))  # hyperscale, enterprise, colo, edge…
    source = Column(
        Enum("pnnl_atlas", "fractracker", "manual", name="data_source_enum"),
        nullable=False,
    )

    # relationships
    estimates = relationship("Estimate", back_populates="facility",
                             cascade="all, delete-orphan")
    demographics = relationship("Demographic", back_populates="facility",
                                cascade="all, delete-orphan")
    epa_compliance = relationship("EPACompliance", back_populates="facility",
                                  cascade="all, delete-orphan")


# ---------------------------------------------------------------------------
# Table 2: estimates
# ---------------------------------------------------------------------------


class Estimate(Base):
    __tablename__ = "estimates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    facility_id = Column(
        Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False
    )

    # electricity (MWh/yr)
    annual_electricity_mwh = Column(Float)
    annual_electricity_low = Column(Float)
    annual_electricity_high = Column(Float)

    # direct operational water (liters/yr)
    annual_direct_water_liters = Column(Float)
    annual_direct_water_low = Column(Float)
    annual_direct_water_high = Column(Float)

    # indirect water embodied in electricity generation (m³/yr)
    annual_indirect_water_m3 = Column(Float)

    # PUE — Power Usage Effectiveness
    pue_estimate = Column(Float)
    pue_low = Column(Float)
    pue_high = Column(Float)

    # WUE — Water Usage Effectiveness (liters/kWh)
    wue_estimate = Column(Float)
    wue_low = Column(Float)
    wue_high = Column(Float)

    # estimation tier: 1=bottom-up, 2=regression, 3=proxy, unestimable
    tier = Column(
        Enum("1", "2", "3", "unestimable", name="estimation_tier_enum"),
        nullable=False,
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    facility = relationship("Facility", back_populates="estimates")


# ---------------------------------------------------------------------------
# Table 3: demographics
# ---------------------------------------------------------------------------


class Demographic(Base):
    __tablename__ = "demographics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    facility_id = Column(
        Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False
    )

    # Census ACS tract identifier (11-digit FIPS: state(2)+county(3)+tract(6))
    census_tract_id = Column(String(11), nullable=False)

    population = Column(Integer)
    median_household_income = Column(Numeric(12, 2))
    pct_nonwhite = Column(Numeric(5, 2))      # 0.00–100.00
    pct_below_poverty = Column(Numeric(5, 2)) # 0.00–100.00
    state = Column(String(2))
    county = Column(String(100))

    facility = relationship("Facility", back_populates="demographics")


# ---------------------------------------------------------------------------
# Table 4: epa_compliance
# ---------------------------------------------------------------------------


class EPACompliance(Base):
    __tablename__ = "epa_compliance"

    id = Column(Integer, primary_key=True, autoincrement=True)
    facility_id = Column(
        Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False
    )

    violation_type = Column(String(255))
    violation_date = Column(Date)
    enforcement_action = Column(Text)
    penalty_amount = Column(Numeric(14, 2))  # USD

    # regulatory program
    program = Column(
        Enum("CAA", "CWA", "RCRA", "SDWA", name="epa_program_enum"),
        nullable=False,
    )

    facility = relationship("Facility", back_populates="epa_compliance")

# ---------------------------------------------------------------------------
# Table 5: county_briefs (for caching API responses)
# ---------------------------------------------------------------------------

class CountyBrief(Base):
    __tablename__ = "county_briefs"
    
    id = Column(Integer, primary_key=True)
    county = Column(String, nullable=False)
    state = Column(String, nullable=False)
    data = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow)
    is_live = Column(Boolean, default=False)

# ---------------------------------------------------------------------------
# Init helper
# ---------------------------------------------------------------------------


def init_db() -> None:
    """Create PostGIS extension (if missing) and all tables."""
    with engine.connect() as conn:
        conn.execute(
            # raw DDL — requires superuser or rds_superuser on RDS
            __import__("sqlalchemy").text("CREATE EXTENSION IF NOT EXISTS postgis;")
        )
        conn.commit()
    Base.metadata.create_all(bind=engine)
    print("Database initialised — all tables created.")


def get_session() -> Session:
    """Return a new SQLAlchemy Session. Caller must close/commit."""
    return Session(bind=engine)


if __name__ == "__main__":
    init_db()


