"""
calculations.py — Project Upstream estimation pipeline.
Implements facility tier classification, ASHRAE climate zone mapping,
Lei & Masanet case selection, parameter sampling, and LHS simulation.
"""

import os
import sys
from dataclasses import dataclass

import numpy as np
from pyDOE3 import lhs as _lhs

# backend/ (parent dir) — ORM models
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from database import Facility

# Data-Center-Water-footprint/ — simulation functions.
# The module loads GP regressors via pickle.load(open('COP_*.pkl')) at import
# time using relative paths, so we must chdir into that directory first.
_SIM_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "Data-Center-Water-footprint")
)
sys.path.insert(0, _SIM_DIR)
_orig_cwd = os.getcwd()
os.chdir(_SIM_DIR)
try:
    import simulation_funs_DC as _sim
finally:
    os.chdir(_orig_cwd)
del _orig_cwd


# ---------------------------------------------------------------------------
# Tier classification
# ---------------------------------------------------------------------------

def classify_tier(facility: Facility) -> str:
    """
    Return estimation tier for a facility.

    Tier 1: known IT load (mw) + known cooling type  → bottom-up simulation
    Tier 2: known IT load, cooling type unknown       → probabilistic cooling mix
    Tier 3: no IT load but footprint (sqft) known     → proxy/regression
    unestimable: neither mw nor sqft available
    """
    has_mw = facility.mw is not None
    has_cooling = facility.cooling_type is not None
    has_sqft = facility.sqft is not None

    if has_mw and has_cooling:
        return "1"
    if has_mw and not has_cooling:
        return "2"
    if not has_mw and has_sqft:
        return "3"
    return "unestimable"


# ---------------------------------------------------------------------------
# ASHRAE climate zone mapping
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Case mapping (Lei & Masanet Table 2)
# ---------------------------------------------------------------------------

_CASE_MAP = {
    ("large",   "airside_economizer_adiabatic_water_chiller"): 1,
    ("large",   "waterside_economizer_water_chiller"):         2,
    ("midsize", "airside_economizer_water_chiller"):           3,
    ("midsize", "waterside_economizer_water_chiller"):         4,
    ("midsize", "water_cooled_chiller"):                       5,
    ("midsize", "airside_economizer_air_chiller"):             6,
    ("midsize", "air_cooled_chiller"):                         7,
    ("small",   "water_cooled_chiller"):                       8,
    ("small",   "air_cooled_chiller"):                         9,
    ("small",   "direct_expansion"):                          10,
}

_SIZE_CLASS_DEFAULTS = {"large": 2, "midsize": 5, "small": 10}


def get_case_number(size_class: str, cooling_type: str) -> int:
    """
    Return Lei & Masanet case number (1-10) for a size_class + cooling_type pair.
    Falls back to the default case for the size class when no exact match exists.
    """
    return _CASE_MAP.get(
        (size_class, cooling_type),
        _SIZE_CLASS_DEFAULTS.get(size_class, 10),
    )


# ---------------------------------------------------------------------------
# Cooling system probability weights (Berkeley Lab 2024, Figure 4.2)
# ---------------------------------------------------------------------------

COOLING_WEIGHTS: dict[str, dict[str, float]] = {
    "small": {
        "direct_expansion":              0.80,
        "air_cooled_chiller":            0.10,
        "water_cooled_chiller":          0.05,
        "airside_economizer_air_chiller":0.05,
    },
    "midsize": {
        "direct_expansion":                    0.20,
        "air_cooled_chiller":                  0.15,
        "water_cooled_chiller":                0.20,
        "airside_economizer_water_chiller":    0.15,
        "waterside_economizer_water_chiller":  0.15,
        "airside_economizer_air_chiller":      0.15,
    },
    "large": {
        "airside_economizer_adiabatic_water_chiller": 0.20,
        "waterside_economizer_water_chiller":         0.25,
        "airside_economizer_water_chiller":           0.20,
        "airside_economizer_air_chiller":             0.15,
        "water_cooled_chiller":                       0.10,
        "air_cooled_chiller":                         0.10,
    },
}


# ---------------------------------------------------------------------------
# Parameter ranges for Latin hypercube sampling (Table B.1)
# ---------------------------------------------------------------------------

# Case 1: large facility, airside economizer + adiabatic + water chiller
_CASE_1_RANGES: dict[str, tuple[float, float]] = {
    "ups_efficiency":            (0.90,    0.99),
    "power_loss_transform":      (0.00,    0.02),
    "lighting_power_ratio":      (0.00,    0.002),
    "supply_air_dbt_lower":      (10.0,   18.0),
    "supply_air_dbt_upper":      (27.0,   35.0),
    "supply_air_dp_lower":       (-12.0,  -9.0),
    "supply_air_dp_upper":       (15.0,   27.0),
    "supply_air_rh_lower":       (8.0,    20.0),
    "supply_air_rh_upper":       (60.0,   95.0),
    "shr":                       (0.95,    0.99),
    "crah_temp_diff":            (13.9,   19.4),
    "facility_water_temp_diff":  (5.0,    10.0),
    "cooling_tower_temp_diff":   (4.0,     6.0),
    "fan_pressure_crah":         (300.0, 1000.0),
    "fan_efficiency_crah":       (0.65,    0.90),
    "fan_pressure_ct":           (100.0,  400.0),
    "fan_efficiency_ct":         (0.65,    0.90),
    "pump_pressure_hd":          (6300.0, 7700.0),
    "pump_efficiency_hd":        (0.60,    0.80),
    "pump_pressure_cw":          (114.9,  172.4),
    "pump_efficiency_cw":        (0.60,    0.80),
    "pump_pressure_ct":          (166.9,  250.4),
    "pump_efficiency_ct":        (0.60,    0.80),
    "approach_temp_ct":          (2.8,     6.7),
    "chiller_partial_load":      (0.2,     0.8),
    "liquid_gas_ratio":          (0.2,     4.0),
    "cop_relative_error":        (-0.11,   0.11),
    "windage_loss":              (0.00005, 0.005),
    "cycles_of_concentration":   (3.0,    15.0),
}

# Case 10 overrides: small facility, direct expansion.
# Parameters absent here are identical to Case 1 (no interpolation drift for
# systems that don't exist in small DX facilities, e.g. cooling towers).
_CASE_10_OVERRIDES: dict[str, tuple[float, float]] = {
    "ups_efficiency":            (0.77,   0.85),
    "power_loss_transform":      (0.02,   0.04),
    "lighting_power_ratio":      (0.02,   0.04),
    "supply_air_dbt_lower":      (18.0,  22.5),
    "supply_air_dbt_upper":      (22.5,  27.0),
    "supply_air_dp_lower":       (-9.9,  -8.1),
    "supply_air_dp_upper":       (13.5,  16.5),
    "supply_air_rh_lower":       (20.0,  30.0),
    "supply_air_rh_upper":       (54.0,  66.0),
    # shr: same as Case 1 (0.95–0.99)
    "crah_temp_diff":            (5.0,    8.0),
    # facility_water_temp_diff: same (retained for water-cooled intermediate cases)
    # cooling_tower_temp_diff: same (retained for cooling-tower intermediate cases)
    "fan_pressure_crah":         (400.0, 600.0),
    "fan_efficiency_crah":       (0.60,   0.75),
    # fan_pressure_ct / fan_efficiency_ct: same
    "pump_pressure_hd":          (6300.0, 7700.0),  # same
    "pump_efficiency_hd":        (0.60,   0.70),
    # pump_pressure_cw / pump_efficiency_cw: same
    # pump_pressure_ct / pump_efficiency_ct: same
    # approach_temp_ct: same
    "chiller_partial_load":      (0.1,    0.5),
    # liquid_gas_ratio: same
    "cop_relative_error":        (-0.45,  0.20),
    # windage_loss: same
    # cycles_of_concentration: same
}

_CASE_10_RANGES: dict[str, tuple[float, float]] = {**_CASE_1_RANGES, **_CASE_10_OVERRIDES}


def get_parameter_ranges(case_number: int) -> dict[str, tuple[float, float]]:
    """
    Return a dict of {param_name: (low, high)} for the given Lei & Masanet
    case number (1-10).  Cases 2-9 are linearly interpolated between Case 1
    (large/complex) and Case 10 (small/DX).
    """
    if case_number == 1:
        return dict(_CASE_1_RANGES)
    if case_number == 10:
        return dict(_CASE_10_RANGES)

    t = (case_number - 1) / 9.0  # 0.0 at case 1, 1.0 at case 10
    result: dict[str, tuple[float, float]] = {}
    for key, (lo1, hi1) in _CASE_1_RANGES.items():
        lo10, hi10 = _CASE_10_RANGES[key]
        result[key] = (
            lo1 + t * (lo10 - lo1),
            hi1 + t * (hi10 - hi1),
        )
    return result


# ---------------------------------------------------------------------------
# ASHRAE climate zone mapping
# ---------------------------------------------------------------------------

def get_climate_zone(lat: float, lon: float) -> str:
    """
    Map a US lat/lon to an ASHRAE 90.1 climate zone string.

    Zones: 1A, 2A, 2B, 3A, 3B, 3C, 4A, 4B, 4C, 5A, 5B, 6A, 6B, 7, 8.
    Boundaries are approximate; representative cities are:
      1A=Miami, 2A=Houston, 2B=Phoenix, 3A=Atlanta, 3B=Las Vegas,
      3C=San Francisco, 4A=Baltimore, 4B=Albuquerque, 4C=Seattle,
      5A=Chicago, 5B=Denver, 6A=Minneapolis, 6B=Helena, 7=Duluth, 8=Fairbanks.
    """
    # Zone 8: Alaska
    if lat > 62.0:
        return "8"

    # Pacific coast strip (west of Cascades/Sierras, lon < -119)
    if lon < -119.0:
        # 4C: Pacific NW coast (Seattle, Portland) — lat > 43
        # 3C: Coastal CA (San Francisco, etc.)    — lat 33-43
        return "4C" if lat > 43.0 else "3C"

    # Zone 1A: South Florida
    if lat < 27.0:
        return "1A"

    # Zone 7: Northern contiguous US (Duluth area, lat > 46.5)
    if lat > 46.5:
        return "7"

    # Zone 6A / 6B: Upper Midwest and Northern Mountain (lat 44-46.5)
    if lat > 44.0:
        return "6B" if lon < -104.0 else "6A"

    # Arid West (lon < -100) vs Humid East (lon >= -100)
    if lon < -100.0:
        # Zone 5B: Mountain states (Denver, Salt Lake City) — lat > 39
        if lat > 39.0:
            return "5B"
        # lat 33.5-39: differentiate NV/CA desert (3B) from NM/CO plateau (4B)
        if lat > 33.5:
            # lon < -113: low-elevation western desert (Las Vegas, inland CA) → 3B
            # lon -113 to -100: high-desert plateau (Albuquerque, Flagstaff) → 4B
            return "3B" if lon < -113.0 else "4B"
        # lat 27-33.5: deep SW desert (Phoenix, Tucson, southern NM) → 2B
        return "2B"

    else:
        # Humid East
        # Zone 5A: Great Lakes / Northeast (Chicago, Boston) — lat 41-44
        if lat > 41.0:
            return "5A"
        # Zone 4A: Mid-Atlantic / Midwest south (Baltimore, DC) — lat 37-41
        if lat > 37.0:
            return "4A"
        # Zone 3A: Humid Southeast inland (Atlanta, Charlotte) — lat 31-37
        if lat > 31.0:
            return "3A"
        # Zone 2A: Gulf Coast / Deep South (Houston, New Orleans) — lat 27-31
        return "2A"


# ---------------------------------------------------------------------------
# Simulation function map (Lei & Masanet case → callable in simulation_funs_DC)
# ---------------------------------------------------------------------------
# Cases 8 and 9 (small water/air chiller) reuse the midsize chiller functions;
# the size-class difference is captured entirely by the interpolated parameter
# ranges produced by get_parameter_ranges().

SIMULATION_FUNC_MAP: dict[int, object] = {
    1:  _sim.PUE_WUE_AE_Chiller,             # large: airside econ + adiabatic + water chiller
    2:  _sim.PUE_WUE_Chiller_Watereconomier, # large: waterside econ + water chiller
    3:  _sim.PUE_WUE_AE_Chiller_Colo,        # midsize: airside econ + water chiller
    4:  _sim.PUE_WUE_WE_Chiller_Colo,        # midsize: waterside econ + water chiller
    5:  _sim.PUE_WUE_Chiller,                # midsize: water-cooled chiller
    6:  _sim.PUE_WUE_AE_AIRChiller,          # midsize: airside econ + air chiller
    7:  _sim.PUE_WUE_AIRChiller,             # midsize: air-cooled chiller
    8:  _sim.PUE_WUE_Chiller,                # small: water-cooled chiller (midsize fn)
    9:  _sim.PUE_WUE_AIRChiller,             # small: air-cooled chiller (midsize fn)
    10: _sim.PUE_WUE_DX,                     # small: direct expansion
}


# ---------------------------------------------------------------------------
# Representative climate inputs by ASHRAE zone (Berkeley Lab / ASHRAE typical)
# temp in °C; rh as fraction 0-1 (converted to % when passed to simulation)
# ---------------------------------------------------------------------------

CLIMATE_PARAMS: dict[str, tuple[float, float]] = {
    "1A": (28.0, 0.75),
    "2A": (22.0, 0.70),
    "2B": (24.0, 0.25),
    "3A": (18.0, 0.60),
    "3B": (20.0, 0.20),
    "3C": (14.0, 0.75),
    "4A": (14.0, 0.65),
    "4B": (12.0, 0.35),
    "4C": (11.0, 0.80),
    "5A": ( 9.0, 0.65),
    "5B": ( 8.0, 0.40),
    "6A": ( 5.0, 0.65),
    "6B": ( 4.0, 0.45),
    "7":  ( 1.0, 0.65),
    "8":  (-8.0, 0.70),
}

# ---------------------------------------------------------------------------
# Per-case w[] assembly specs
# ---------------------------------------------------------------------------
# Each list defines w[3], w[4], ... (after the 3 fixed climate inputs).
# Strings → sample from get_parameter_ranges(); floats → fixed value.
#
# Four parameters appear in WE/chiller functions but are absent from Table B.1:
#   HTE   — heat transfer effectiveness of facility-water heat exchanger
#   AT_HE — approach temperature of the waterside-economizer heat exchanger (°C)
#   P_WE  — waterside-economizer pump pressure (kPa, midpoint of CW pump range)
#   E_WE  — waterside-economizer pump efficiency
# These are held fixed at representative mid-range values.

_HTE  = 0.70    # heat transfer effectiveness (–)
_AT_HE = 2.8    # WE HX approach temperature (°C)
_P_WE  = 143.7  # WE pump pressure kPa  (≈ midpoint of pump_pressure_cw range)
_E_WE  = 0.70   # WE pump efficiency (–)

_CASE_W_SPEC: dict[int, list] = {
    # ── Case 1: PUE_WUE_AE_Chiller ── w[3:32] (29 sampled params)
    1: [
        "ups_efficiency", "power_loss_transform", "lighting_power_ratio",
        "crah_temp_diff",
        "fan_pressure_crah", "fan_efficiency_crah",
        "pump_pressure_hd", "pump_efficiency_hd",
        "approach_temp_ct", "chiller_partial_load", "facility_water_temp_diff",
        "pump_pressure_cw", "pump_efficiency_cw",
        "cooling_tower_temp_diff",
        "pump_pressure_ct", "pump_efficiency_ct",
        "windage_loss", "cycles_of_concentration",
        "fan_pressure_ct", "fan_efficiency_ct",
        "shr", "liquid_gas_ratio",
        "supply_air_dbt_upper", "supply_air_dbt_lower",
        "supply_air_dp_upper",  "supply_air_dp_lower",
        "supply_air_rh_upper",  "supply_air_rh_lower",
        "cop_relative_error",
    ],
    # ── Case 2: PUE_WUE_Chiller_Watereconomier ── w[3:36] (29 sampled + 4 fixed)
    2: [
        "ups_efficiency", "power_loss_transform", "lighting_power_ratio",
        "shr", "crah_temp_diff",
        "fan_pressure_crah", "fan_efficiency_crah",
        "pump_pressure_hd", "pump_efficiency_hd",
        _HTE,                           # w[12] HTE — fixed
        "facility_water_temp_diff",
        "approach_temp_ct",
        _AT_HE, _P_WE, _E_WE,          # w[15-17] AT_HE, P_WE, E_WE — fixed
        "pump_pressure_cw", "pump_efficiency_cw",
        "chiller_partial_load",
        "cooling_tower_temp_diff",
        "pump_pressure_ct", "pump_efficiency_ct",
        "windage_loss", "cycles_of_concentration",
        "liquid_gas_ratio",
        "fan_pressure_ct", "fan_efficiency_ct",
        "supply_air_dbt_upper", "supply_air_dbt_lower",
        "supply_air_dp_upper",  "supply_air_dp_lower",
        "supply_air_rh_upper",  "supply_air_rh_lower",
        "cop_relative_error",
    ],
    # ── Case 3: PUE_WUE_AE_Chiller_Colo ── identical layout to Case 1
    3: [
        "ups_efficiency", "power_loss_transform", "lighting_power_ratio",
        "crah_temp_diff",
        "fan_pressure_crah", "fan_efficiency_crah",
        "pump_pressure_hd", "pump_efficiency_hd",
        "approach_temp_ct", "chiller_partial_load", "facility_water_temp_diff",
        "pump_pressure_cw", "pump_efficiency_cw",
        "cooling_tower_temp_diff",
        "pump_pressure_ct", "pump_efficiency_ct",
        "windage_loss", "cycles_of_concentration",
        "fan_pressure_ct", "fan_efficiency_ct",
        "shr", "liquid_gas_ratio",
        "supply_air_dbt_upper", "supply_air_dbt_lower",
        "supply_air_dp_upper",  "supply_air_dp_lower",
        "supply_air_rh_upper",  "supply_air_rh_lower",
        "cop_relative_error",
    ],
    # ── Case 4: PUE_WUE_WE_Chiller_Colo ── identical layout to Case 2
    4: [
        "ups_efficiency", "power_loss_transform", "lighting_power_ratio",
        "shr", "crah_temp_diff",
        "fan_pressure_crah", "fan_efficiency_crah",
        "pump_pressure_hd", "pump_efficiency_hd",
        _HTE,
        "facility_water_temp_diff",
        "approach_temp_ct",
        _AT_HE, _P_WE, _E_WE,
        "pump_pressure_cw", "pump_efficiency_cw",
        "chiller_partial_load",
        "cooling_tower_temp_diff",
        "pump_pressure_ct", "pump_efficiency_ct",
        "windage_loss", "cycles_of_concentration",
        "liquid_gas_ratio",
        "fan_pressure_ct", "fan_efficiency_ct",
        "supply_air_dbt_upper", "supply_air_dbt_lower",
        "supply_air_dp_upper",  "supply_air_dp_lower",
        "supply_air_rh_upper",  "supply_air_rh_lower",
        "cop_relative_error",
    ],
    # ── Cases 5 & 8: PUE_WUE_Chiller ── w[3:33] (29 sampled + 1 fixed HTE)
    5: [
        "ups_efficiency", "power_loss_transform", "lighting_power_ratio",
        "shr", "crah_temp_diff",
        "fan_pressure_crah", "fan_efficiency_crah",
        "pump_pressure_hd", "pump_efficiency_hd",
        _HTE,                           # w[12] HTE — fixed
        "facility_water_temp_diff",
        "pump_pressure_cw", "pump_efficiency_cw",
        "approach_temp_ct", "chiller_partial_load",
        "cooling_tower_temp_diff",
        "pump_pressure_ct", "pump_efficiency_ct",
        "windage_loss", "cycles_of_concentration",
        "fan_pressure_ct", "fan_efficiency_ct",
        "liquid_gas_ratio",
        "supply_air_dbt_upper", "supply_air_dbt_lower",
        "supply_air_dp_upper",  "supply_air_dp_lower",
        "supply_air_rh_upper",  "supply_air_rh_lower",
        "cop_relative_error",
    ],
    # ── Case 6: PUE_WUE_AE_AIRChiller ── w[3:24] (20 sampled + 1 fixed HTE)
    6: [
        "ups_efficiency", "power_loss_transform", "lighting_power_ratio",
        "crah_temp_diff",
        "fan_pressure_crah", "fan_efficiency_crah",
        "shr",
        "pump_pressure_hd", "pump_efficiency_hd",
        _HTE,                           # w[12] HTE — fixed
        "facility_water_temp_diff",
        "pump_pressure_cw", "pump_efficiency_cw",
        "cop_relative_error", "chiller_partial_load",
        "supply_air_dbt_upper", "supply_air_dbt_lower",
        "supply_air_dp_upper",  "supply_air_dp_lower",
        "supply_air_rh_upper",  "supply_air_rh_lower",
    ],
    # ── Cases 7 & 9: PUE_WUE_AIRChiller ── w[3:24] (20 sampled + 1 fixed HTE)
    7: [
        "ups_efficiency", "power_loss_transform", "lighting_power_ratio",
        "shr", "crah_temp_diff",
        "fan_pressure_crah", "fan_efficiency_crah",
        "pump_pressure_hd", "pump_efficiency_hd",
        _HTE,                           # w[12] HTE — fixed
        "facility_water_temp_diff",
        "pump_pressure_cw", "pump_efficiency_cw",
        "chiller_partial_load", "cop_relative_error",
        "supply_air_dbt_upper", "supply_air_dbt_lower",
        "supply_air_dp_upper",  "supply_air_dp_lower",
        "supply_air_rh_upper",  "supply_air_rh_lower",
    ],
    # ── Case 8: small water chiller — same w[] layout as Case 5
    8: [
        "ups_efficiency", "power_loss_transform", "lighting_power_ratio",
        "shr", "crah_temp_diff",
        "fan_pressure_crah", "fan_efficiency_crah",
        "pump_pressure_hd", "pump_efficiency_hd",
        _HTE,
        "facility_water_temp_diff",
        "pump_pressure_cw", "pump_efficiency_cw",
        "approach_temp_ct", "chiller_partial_load",
        "cooling_tower_temp_diff",
        "pump_pressure_ct", "pump_efficiency_ct",
        "windage_loss", "cycles_of_concentration",
        "fan_pressure_ct", "fan_efficiency_ct",
        "liquid_gas_ratio",
        "supply_air_dbt_upper", "supply_air_dbt_lower",
        "supply_air_dp_upper",  "supply_air_dp_lower",
        "supply_air_rh_upper",  "supply_air_rh_lower",
        "cop_relative_error",
    ],
    # ── Case 9: small air chiller — same w[] layout as Case 7
    9: [
        "ups_efficiency", "power_loss_transform", "lighting_power_ratio",
        "shr", "crah_temp_diff",
        "fan_pressure_crah", "fan_efficiency_crah",
        "pump_pressure_hd", "pump_efficiency_hd",
        _HTE,
        "facility_water_temp_diff",
        "pump_pressure_cw", "pump_efficiency_cw",
        "chiller_partial_load", "cop_relative_error",
        "supply_air_dbt_upper", "supply_air_dbt_lower",
        "supply_air_dp_upper",  "supply_air_dp_lower",
        "supply_air_rh_upper",  "supply_air_rh_lower",
    ],
    # ── Case 10: PUE_WUE_DX ── w[3:17] (14 sampled params, no cooling tower)
    10: [
        "ups_efficiency", "power_loss_transform", "lighting_power_ratio",
        "shr", "crah_temp_diff",
        "fan_pressure_crah", "fan_efficiency_crah",
        "supply_air_dbt_upper", "supply_air_dbt_lower",
        "supply_air_dp_upper",  "supply_air_dp_lower",
        "supply_air_rh_upper",  "supply_air_rh_lower",
        "cop_relative_error",
    ],
}


# ---------------------------------------------------------------------------
# Latin hypercube simulation
# ---------------------------------------------------------------------------

def run_lhs_simulation(
    case_number: int,
    climate_zone: str,
    n_samples: int = 50,
) -> dict[str, float]:
    """
    Run the Lei & Masanet PUE/WUE simulation for *case_number* facilities
    located in *climate_zone* using Latin hypercube sampling.

    Returns a dict with keys:
        pue_median, pue_p10, pue_p90, wue_median, wue_p10, wue_p90
    """
    # ── Climate inputs (fixed, not sampled) ──────────────────────────────────
    t_oa, rh_frac = CLIMATE_PARAMS[climate_zone]
    rh_oa = rh_frac * 100.0   # simulation functions divide RH by 100 internally
    p_oa  = 101325.0           # Pa, standard atmosphere

    # ── Parameter ranges for this case ───────────────────────────────────────
    ranges = get_parameter_ranges(case_number)
    w_spec = _CASE_W_SPEC[case_number]

    # Identify only the string (sampled) positions; floats are injected as-is
    sampled_keys = [s for s in w_spec if isinstance(s, str)]
    n_params = len(sampled_keys)

    # ── Latin hypercube sample matrix: (n_samples × n_params) in [0, 1] ──────
    lhs_unit = _lhs(n_params, samples=n_samples)

    # Scale from [0,1] to actual [low, high]
    lows  = np.array([ranges[k][0] for k in sampled_keys])
    highs = np.array([ranges[k][1] for k in sampled_keys])
    scaled = lows + lhs_unit * (highs - lows)   # shape: (n_samples, n_params)

    # ── Run simulation ────────────────────────────────────────────────────────
    sim_fn = SIMULATION_FUNC_MAP[case_number]
    pue_list: list[float] = []
    wue_list: list[float] = []

    for i in range(n_samples):
        # Build named lookup for this sample row
        sample = {k: float(scaled[i, j]) for j, k in enumerate(sampled_keys)}

        # Assemble w[] vector: [T_oa, RH_oa, P_oa] + per-spec values
        w: list[float] = [t_oa, rh_oa, p_oa]
        for entry in w_spec:
            w.append(sample[entry] if isinstance(entry, str) else entry)

        try:
            pue, wue = sim_fn(w)
            if np.isfinite(pue) and np.isfinite(wue) and pue > 1.0:
                pue_list.append(float(pue))
                wue_list.append(float(wue))
        except Exception:
            pass  # skip numerically infeasible samples

    pue_arr = np.array(pue_list)
    wue_arr = np.array(wue_list)

    return {
        "pue_median": float(np.median(pue_arr)),
        "pue_p10":    float(np.percentile(pue_arr, 10)),
        "pue_p90":    float(np.percentile(pue_arr, 90)),
        "wue_median": float(np.median(wue_arr)),
        "wue_p10":    float(np.percentile(wue_arr, 10)),
        "wue_p90":    float(np.percentile(wue_arr, 90)),
    }


# ---------------------------------------------------------------------------
# EstimateResult dataclass
# ---------------------------------------------------------------------------

from dataclasses import dataclass


@dataclass
class EstimateResult:
    facility_id: int

    # Electricity (MWh/yr); None for Tier 3 or unestimable
    annual_electricity_mwh:  float | None
    annual_electricity_low:  float | None
    annual_electricity_high: float | None

    # Direct operational water (liters/yr); None for Tier 3 or unestimable
    annual_direct_water_liters: float | None
    annual_direct_water_low:    float | None
    annual_direct_water_high:   float | None

    # Indirect water embedded in grid electricity (m³/yr)
    annual_indirect_water_m3: float | None

    # PUE — Power Usage Effectiveness
    pue_estimate: float | None
    pue_low:      float | None
    pue_high:     float | None

    # WUE — Water Usage Effectiveness (L/kWh IT)
    wue_estimate: float | None
    wue_low:      float | None
    wue_high:     float | None

    # Estimation tier: "1", "2", "3", or "unestimable"
    tier: str


# ---------------------------------------------------------------------------
# run_estimation
# ---------------------------------------------------------------------------

# Indirect water intensity factor for US grid electricity.
# Source: Meldrum et al. 2013 / NREL — median ~1.8 m³/MWh for thermoelectric
# generation mix consumed by data centers.
_INDIRECT_WATER_M3_PER_MWH = 1.8


def run_estimation(facility: Facility) -> EstimateResult:
    """
    Produce a full PUE/WUE/electricity/water estimate for *facility*.

    Tier 1 — known IT load + cooling type: single deterministic case, LHS CI.
    Tier 2 — known IT load, cooling unknown: probability-weighted average over
              cooling types from COOLING_WEIGHTS[size_class].
    Tier 3 — no IT load, footprint known: PUE/WUE reference only, no energy/
              water totals (MW unknown).
    Unestimable — no MW and no sqft: all numeric fields None.
    """
    tier = classify_tier(facility)

    # ── Unestimable ──────────────────────────────────────────────────────────
    if tier == "unestimable":
        return EstimateResult(
            facility_id=facility.id,
            annual_electricity_mwh=None,  annual_electricity_low=None,
            annual_electricity_high=None,
            annual_direct_water_liters=None, annual_direct_water_low=None,
            annual_direct_water_high=None,
            annual_indirect_water_m3=None,
            pue_estimate=None, pue_low=None, pue_high=None,
            wue_estimate=None, wue_low=None, wue_high=None,
            tier="unestimable",
        )

    climate_zone = get_climate_zone(float(facility.lat), float(facility.lon))

    # ── Tier 1: known MW + cooling type ─────────────────────────────────────
    if tier == "1":
        case_num = get_case_number(facility.size_class, facility.cooling_type)
        sim = run_lhs_simulation(case_num, climate_zone)
        return _build_result(facility, sim, tier)

    # ── Tier 2: known MW, cooling type unknown ───────────────────────────────
    if tier == "2":
        weights = COOLING_WEIGHTS.get(facility.size_class, {})
        if not weights:
            # Fallback: no weight table for this size class → use default case
            case_num = _SIZE_CLASS_DEFAULTS.get(facility.size_class, 10)
            sim = run_lhs_simulation(case_num, climate_zone)
        else:
            sim = _weighted_simulation(facility.size_class, climate_zone, weights)
        return _build_result(facility, sim, tier)

    # ── Tier 3: no MW, sqft known ────────────────────────────────────────────
    # Run simulation for PUE/WUE reference using the default case for size class.
    # Electricity and water totals cannot be computed without MW.
    case_num = _SIZE_CLASS_DEFAULTS.get(facility.size_class or "small", 10)
    sim = run_lhs_simulation(case_num, climate_zone)
    return EstimateResult(
        facility_id=facility.id,
        annual_electricity_mwh=None,  annual_electricity_low=None,
        annual_electricity_high=None,
        annual_direct_water_liters=None, annual_direct_water_low=None,
        annual_direct_water_high=None,
        annual_indirect_water_m3=None,
        pue_estimate=sim["pue_median"], pue_low=sim["pue_p10"],
        pue_high=sim["pue_p90"],
        wue_estimate=sim["wue_median"], wue_low=sim["wue_p10"],
        wue_high=sim["wue_p90"],
        tier="3",
    )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _weighted_simulation(
    size_class: str,
    climate_zone: str,
    weights: dict[str, float],
) -> dict[str, float]:
    """
    Run LHS simulation for each cooling type in *weights* and return a
    probability-weighted composite of all six PUE/WUE statistics.
    """
    accum: dict[str, float] = {
        "pue_median": 0.0, "pue_p10": 0.0, "pue_p90": 0.0,
        "wue_median": 0.0, "wue_p10": 0.0, "wue_p90": 0.0,
    }
    total_weight = 0.0

    for cooling_type, weight in weights.items():
        case_num = get_case_number(size_class, cooling_type)
        try:
            sim = run_lhs_simulation(case_num, climate_zone)
        except Exception:
            continue  # skip cooling types whose simulation fails
        for key in accum:
            accum[key] += weight * sim[key]
        total_weight += weight

    if total_weight > 0 and abs(total_weight - 1.0) > 1e-6:
        # Re-normalise if any cooling types were skipped
        for key in accum:
            accum[key] /= total_weight

    return accum


def _build_result(
    facility: Facility,
    sim: dict[str, float],
    tier: str,
) -> EstimateResult:
    """
    Convert a simulation result dict + facility into a populated EstimateResult.

    Electricity (MWh/yr):
        total_mwh = facility.mw * 8760   (design capacity assumed fully loaded)

    IT load (kW):
        it_kw = (facility.mw * 1000) / pue

    Direct water (liters/yr):
        WUE [L/kWh_IT] * IT_load [kW] * 8760 [h/yr]

    Indirect water (m³/yr):
        total_electricity [MWh] * 1.8 [m³/MWh]
    """
    mw = facility.mw  # design IT capacity in MW

    # ── Electricity ──────────────────────────────────────────────────────────
    elec_mwh      = mw * 8760
    # P10 PUE → more efficient → less total power draw for same IT → lower bound
    # P90 PUE → less efficient → more total power draw → upper bound
    # (We hold IT load fixed at mw and scale overhead by PUE.)
    elec_low      = mw * 8760 * (sim["pue_p10"] / sim["pue_median"])
    elec_high     = mw * 8760 * (sim["pue_p90"] / sim["pue_median"])

    # ── IT load (kW) at median PUE ────────────────────────────────────────────
    it_kw = (mw * 1000.0) / sim["pue_median"]

    # ── Direct water ─────────────────────────────────────────────────────────
    # WUE units from simulation: L/kWh_IT  (confirmed: *3600/Power_IT in sim)
    water_l       = sim["wue_median"] * it_kw * 8760.0
    water_low     = sim["wue_p10"]    * it_kw * 8760.0
    water_high    = sim["wue_p90"]    * it_kw * 8760.0

    # ── Indirect water ───────────────────────────────────────────────────────
    indirect_m3 = elec_mwh * _INDIRECT_WATER_M3_PER_MWH

    return EstimateResult(
        facility_id=facility.id,
        annual_electricity_mwh=elec_mwh,
        annual_electricity_low=elec_low,
        annual_electricity_high=elec_high,
        annual_direct_water_liters=water_l,
        annual_direct_water_low=water_low,
        annual_direct_water_high=water_high,
        annual_indirect_water_m3=indirect_m3,
        pue_estimate=sim["pue_median"],
        pue_low=sim["pue_p10"],
        pue_high=sim["pue_p90"],
        wue_estimate=sim["wue_median"],
        wue_low=sim["wue_p10"],
        wue_high=sim["wue_p90"],
        tier=tier,
    )
