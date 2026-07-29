import re
import math
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

GAL_PER_FT3 = 7.48052
GAL_PER_M3 = 264.172
FT_PER_M = 3.28084
PI = math.pi

class MatchedUnit(BaseModel):
    v: float
    u: str
    i: int

class CalculationResult(BaseModel):
    ok: bool
    via: Optional[str] = None
    minutes: Optional[float] = None
    detail: Optional[Dict[str, Any]] = None
    need: Optional[List[str]] = None

def match_num_unit(pattern: str, text: str) -> List[MatchedUnit]:
    matches = []
    for match in re.finditer(pattern, text, re.IGNORECASE):
        matches.append(MatchedUnit(v=float(match.group(1)), u=match.group(3).lower(), i=match.start()))
    return matches

def to_gpm(flow: Optional[MatchedUnit]) -> Optional[float]:
    if not flow:
        return None
    v, u = flow.v, flow.u
    if u == 'gpm':
        return v
    if u in ('l/min', 'lpm'):
        return v / 3.78541
    if u in ('m3/h', 'm³/h'):
        return (v * GAL_PER_M3) / 60
    return None

def to_gal(vol: Optional[MatchedUnit]) -> Optional[float]:
    if not vol:
        return None
    v, u = vol.v, vol.u
    if u == 'gal':
        return v
    if u in ('ft3', 'ft³'):
        return v * GAL_PER_FT3
    if u in ('m3', 'm³'):
        return v * GAL_PER_M3
    return None

def to_feet(val: float, unit: str) -> float:
    if unit == 'ft':
        return val
    if unit == 'in':
        return val / 12
    if unit == 'm':
        return val * FT_PER_M
    if unit == 'cm':
        return (val / 100.0) * FT_PER_M
    return val

def compute_ebct(input_text: str) -> Dict[str, Any]:
    flow_match = match_num_unit(r"(\d+(\.\d+)?)\s*(gpm|l/min|lpm|m3/h|m³/h)", input_text)
    flow = flow_match[0] if flow_match else None
    vol_match = match_num_unit(r"(\d+(\.\d+)?)\s*(gal|ft3|ft³|m3|m³)(?!/)", input_text)
    vol = vol_match[-1] if vol_match else None
    dims_match = match_num_unit(r"(\d+(\.\d+)?)\s*(ft|m|in|cm)", input_text)
    gpm = to_gpm(flow)
    trace = {'raw': input_text, 'matches': {'flow': [m.dict() for m in flow_match] if flow_match else [], 'volume': [m.dict() for m in vol_match] if vol_match else [], 'dims': [m.dict() for m in dims_match]}}

    if vol and gpm:
        gal = to_gal(vol)
        if gal:
            minutes = gal / gpm
            explanation = f"EBCT(min) = Volume(gal) / Flow(gal/min)\n= {gal} / {gpm}\n= {minutes} minutes"
            result = CalculationResult(
                ok=True,
                via='volume+flow',
                minutes=minutes,
                detail={
                    'inputs': {'flow': flow.dict(), 'volume': vol.dict()},
                    'units_normalized': {'volume_gal': gal, 'flow_gpm': gpm},
                    'constants': {'GAL_PER_FT3': GAL_PER_FT3, 'GAL_PER_M3': GAL_PER_M3},
                    'formula': 'EBCT(min) = V(gal) / Q(gal/min)',
                    'explanation': explanation,
                    'trace': trace
                }
            )
            return result.dict()

    if len(dims_match) >= 2 and gpm:
        d_val, d_unit = dims_match[0].v, dims_match[0].u
        h_val, h_unit = dims_match[1].v, dims_match[1].u
        D_ft = to_feet(d_val, d_unit)
        H_ft = to_feet(h_val, h_unit)
        ft3 = PI * (D_ft / 2) ** 2 * H_ft
        gal = ft3 * GAL_PER_FT3
        minutes = gal / gpm
        explanation = f"V(ft^3) = π * (D/2)^2 * H = {PI} * ({D_ft}/2)^2 * {H_ft} = {ft3} ft^3\nVolume(gal) = {ft3} * {GAL_PER_FT3} = {gal} gal\nEBCT(min) = {gal} / {gpm} = {minutes} minutes"
        result = CalculationResult(
            ok=True,
            via='dims+flow (assume cylinder)',
            minutes=minutes,
            detail={
                'inputs': {'flow': flow.dict(), 'D': {'v': d_val, 'u': d_unit}, 'H': {'v': h_val, 'u': h_unit}},
                'units_normalized': {'D_ft': D_ft, 'H_ft': H_ft, 'ft3': ft3, 'volume_gal': gal, 'flow_gpm': gpm},
                'constants': {'GAL_PER_FT3': GAL_PER_FT3, 'PI': PI},
                'formula': 'V=π(D/2)^2H; EBCT=V(gal)/Q(gpm)',
                'explanation': explanation,
                'trace': trace
            }
        )
        return result.dict()

    need = []
    if not gpm:
        need.append('Flow rate (e.g., 800 gpm, 3.5 m3/h)')
    if not vol and len(dims_match) < 2:
        need.append('Bed volume (e.g., 9600 gal) or tank dimensions (e.g., 10 ft diameter, 8 ft height)')
    result = CalculationResult(ok=False, need=need)
    return result.dict()
