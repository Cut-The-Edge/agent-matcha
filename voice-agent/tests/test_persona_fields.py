"""
Mechanical enforcement: every save_intake_data parameter must appear in
the SYSTEM_PROMPT field checklist (or be in the known-exclusions list).

If this test fails, it means a field was added to save_intake_data but not
to the persona prompt — the agent won't know to ask about it.
"""

import inspect
import sys
from pathlib import Path

# Add parent directory to path so we can import persona and agent
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from persona import SYSTEM_PROMPT


def _get_save_intake_data_params() -> set[str]:
    """Extract parameter names from MatchaAgent.save_intake_data via source inspection.

    We parse the source rather than importing MatchaAgent (which requires
    livekit and other heavy dependencies) to keep this test lightweight.
    """
    agent_path = Path(__file__).resolve().parent.parent / "agent.py"
    source = agent_path.read_text()

    # Find the function signature block
    start = source.index("async def save_intake_data(")
    # Find the closing `) -> dict:` of the signature
    end = source.index(") -> dict:", start)
    sig_block = source[start:end]

    # Extract parameter names (lines like `        first_name: str | None = None,`)
    params = set()
    for line in sig_block.splitlines():
        line = line.strip().rstrip(",")
        if ":" in line and "=" in line:
            param_name = line.split(":")[0].strip()
            if param_name not in ("self", "context"):
                params.add(param_name)

    return params


# Fields that are NOT collected through the field checklist:
# - first_name / last_name: collected during greeting
# - instagram: collected via form link (send_data_request_link)
# - additional_notes: freeform, agent fills at save time
# - membership_interest: Phase 3 / if they bring it up
EXCLUDED_PARAMS = {
    "first_name",
    "last_name",
    "instagram",
    "additional_notes",
    "membership_interest",
}

# Maps save_intake_data param names to the text that appears in the prompt.
# Only needed when the prompt uses a different name than the parameter.
ALIAS_MAP: dict[str, list[str]] = {
    "family_info": ["family"],
    "jewish_observance": ["jewish observance"],
    "kosher_level": ["kosher level", "kosher"],
    "shabbat_observance": ["shabbat observance", "shabbat"],
    "looking_for": ["perfect partner", "ideal partner"],
    "physical_preferences": ["physical preferences", "perfect partner"],
    "age_range_preference": ["age range preference"],
    "must_haves": ["must-haves"],
    "marriage_timeline": ["marriage timeline"],
    "kids_preference": ["kids", "children preference", "kids timeline"],
    "day_in_life": ["day in life"],
    "drink_alcohol": ["drink"],
    "political_affiliation": ["political"],
    "education_level": ["education"],
    "college_details": ["college"],
    "weekend_preferences": ["weekend"],
    "friends_describe": ["friends"],
    "what_you_notice": ["notice first", "notice"],
    "children_details": ["children"],
    "long_distance": ["long distance", "distance"],
    "sexual_orientation": ["sexual orientation", "orientation"],
    "career_overview": ["career overview", "career"],
    "relationship_status": ["relationship status"],
    "relationship_history": ["relationship history"],
    "willing_to_relocate": ["relocat"],
    "personal_growth": ["personal growth"],
    "pref_seeking": ["perfect partner"],
    "pref_sexual_orientation": ["perfect partner"],
    "pref_relationship_status": ["perfect partner"],
    "pref_ethnicity": ["ethnicity", "perfect partner"],
    "pref_religion": ["religio", "perfect partner"],
    "pref_education": ["education", "perfect partner"],
    "pref_income": ["income", "perfect partner"],
    "pref_height_range": ["height", "perfect partner"],
    "pref_hair_color": ["hair", "perfect partner"],
    "pref_eye_color": ["eye", "perfect partner"],
    "pref_political": ["political", "perfect partner"],
    "pref_smoking": ["smoker", "smoking"],
    "pref_drinking": ["drinker", "drinking"],
    "pref_children": ["children preference"],
    "pref_relocating": ["relocat"],
    "pref_partner_values": ["partner values", "values", "perfect partner"],
    "pref_partner_interests": ["partner interests", "interests", "perfect partner"],
}


def test_all_save_intake_data_fields_in_prompt():
    """Every save_intake_data parameter must be mentioned in SYSTEM_PROMPT."""
    params = _get_save_intake_data_params()
    assert len(params) > 40, f"Expected 40+ params, got {len(params)} — parser may be broken"

    prompt_lower = SYSTEM_PROMPT.lower()
    missing = []

    for param in sorted(params - EXCLUDED_PARAMS):
        # Check direct name match (underscores → spaces)
        readable = param.replace("_", " ")
        if readable in prompt_lower:
            continue

        # Check alias matches
        aliases = ALIAS_MAP.get(param, [])
        if any(alias.lower() in prompt_lower for alias in aliases):
            continue

        # Check the raw param name (e.g. "birthdate")
        if param in prompt_lower:
            continue

        missing.append(param)

    assert not missing, (
        f"These save_intake_data fields are NOT mentioned in SYSTEM_PROMPT "
        f"and are not in the exclusion list:\n"
        + "\n".join(f"  - {p}" for p in missing)
        + "\n\nEither add them to the field checklist in persona.py, "
        "or add them to EXCLUDED_PARAMS / ALIAS_MAP in this test."
    )


def test_excluded_params_are_valid():
    """Sanity check: every excluded param must actually exist in save_intake_data."""
    params = _get_save_intake_data_params()
    invalid = EXCLUDED_PARAMS - params
    assert not invalid, (
        f"EXCLUDED_PARAMS contains names not in save_intake_data: {invalid}"
    )


def test_alias_map_keys_are_valid():
    """Sanity check: every alias map key must be a real save_intake_data param."""
    params = _get_save_intake_data_params()
    invalid = set(ALIAS_MAP.keys()) - params
    assert not invalid, (
        f"ALIAS_MAP contains keys not in save_intake_data: {invalid}"
    )
