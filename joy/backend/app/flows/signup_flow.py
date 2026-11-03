"""The WhatsApp sign-up form (a static WhatsApp Flow, no data endpoint).

Three screens: about you, where you are, health and consent. Areas come from RH's travel zones
(the ``service_areas`` operation) when the form is published by scripts/publish_signup_flow.py:
states whose home visits are split into zones (Lagos, FCT, Oyo) get a dropdown of their areas;
every other state gets a "town or area" box that RH's zone matching resolves. Published flows
can't be edited, so a change to zones is published as a new form version.
"""

from __future__ import annotations

from typing import Any

FLOW_JSON_VERSION = "7.3"
TERMS_URL = "https://physioaroundme.com/terms-and-conditions"
PRIVACY_URL = "https://physioaroundme.com/privacy-policy"

GENDERS = [
    {"id": "female", "title": "Female"},
    {"id": "male", "title": "Male"},
    {"id": "prefer_not_to_say", "title": "Prefer not to say"},
]

# Optional; shared with the treating physiotherapist (wording pending clinical-lead review)
HEALTH_CONDITIONS = [
    {"id": "none", "title": "None of these"},
    {"id": "high_blood_pressure", "title": "High blood pressure"},
    {"id": "diabetes", "title": "Diabetes"},
    {"id": "asthma", "title": "Asthma"},
    {"id": "heart_condition", "title": "Heart condition"},
    {"id": "arthritis", "title": "Arthritis"},
    {"id": "previous_surgery", "title": "Surgery in the last year"},
    {"id": "pregnancy", "title": "Pregnant"},
    {"id": "other", "title": "Something else"},
]

OTHER_AREA = "*"


MAX_DROPDOWN_ROWS = 200  # WhatsApp Flows limit per dropdown


def _other_rows(cities: list[dict]) -> list[dict]:
    rows = []
    for city in cities:
        name = str(city.get("city") or "")
        if any(OTHER_AREA in (zone.get("areas") or []) for zone in city.get("zones") or []):
            label = "Elsewhere in Oyo State" if name == "Oyo State" else f"Other area in {name}"
            rows.append({"id": f"{OTHER_AREA}|{name}", "title": label[:30]})
    return rows


def _area_options(cities: list[dict]) -> list[dict]:
    """Dropdown rows "Area|City", one per named area, then each city's "other areas" row.

    A state with more areas than a dropdown holds lists its zones instead ("Lekki", "Ajah &
    beyond"...); the patient types the exact area in the town box. Nothing is cut off.
    """
    others = _other_rows(cities)
    rows: list[dict] = []
    for city in cities:
        name = str(city.get("city") or "")
        named = sorted({a for zone in city.get("zones") or [] for a in zone.get("areas") or [] if a != OTHER_AREA})
        rows += [{"id": f"{area}|{name}", "title": area[:30]} for area in named]
    if len(rows) + len(others) <= MAX_DROPDOWN_ROWS:
        return rows + others
    zones = [
        {"id": f"{named[0]}|{city.get('city')}", "title": str(zone.get("name") or named[0])[:30]}
        for city in cities for zone in city.get("zones") or []
        if (named := [a for a in zone.get("areas") or [] if a != OTHER_AREA])
    ]
    return (zones + others)[:MAX_DROPDOWN_ROWS]


def _states(cities: list[dict]) -> tuple[list[dict], dict[str, list[dict]]]:
    """State dropdown rows and, for states split into zones, their area rows."""
    by_state: dict[str, list[dict]] = {}
    for city in cities:
        by_state.setdefault(str(city.get("state") or city.get("city") or ""), []).append(city)
    zoned = {
        state: _area_options(entries)
        for state, entries in by_state.items()
        if sum(len(entry.get("zones") or []) for entry in entries) > 1
    }
    titles = {"FCT": "Abuja (FCT)"}
    first = {"Lagos": 0, "FCT": 1}  # most patients, then the rest A to Z
    states = sorted(by_state, key=lambda s: (first.get(s, 2), titles.get(s, s)))
    return [{"id": s, "title": titles.get(s, s)} for s in states if s], zoned


def _visible_when(state: str) -> str:
    return f"`${{form.state}} == '{state}'`"


def build_signup_flow(cities: list[dict]) -> dict[str, Any]:
    """Flow JSON for the sign-up form, from RH service_areas cities."""
    states, zoned = _states(cities)
    area_fields = [
        {
            "type": "Dropdown",
            "name": f"area_{_field_key(state)}",
            "label": "Your area",
            "data-source": rows,
            "required": False,
            "visible": _visible_when(state),
        }
        for state, rows in zoned.items()
    ]
    # Always shown: the only place box for most states, and for an area missing from a list
    town_field = {
        "type": "TextInput",
        "name": "town",
        "label": "Town or area",
        "input-type": "text",
        "required": False,
        "helper-text": "For example Akure or Warri, or your area if it isn't in the list",
    }
    return {
        "version": FLOW_JSON_VERSION,
        "screens": [
            {
                "id": "ABOUT_YOU",
                "title": "Join Rehabify",
                "data": {},
                "layout": {"type": "SingleColumnLayout", "children": [
                    {"type": "TextHeading", "text": "Tell us about you"},
                    {"type": "TextBody", "text": "This takes about a minute. Your details stay private and only your care team sees them."},
                    {"type": "TextInput", "name": "first_name", "label": "First name", "input-type": "text", "required": True},
                    {"type": "TextInput", "name": "last_name", "label": "Last name", "input-type": "text", "required": True},
                    {"type": "RadioButtonsGroup", "name": "gender", "label": "Gender", "data-source": GENDERS, "required": True},
                    {"type": "DatePicker", "name": "date_of_birth", "label": "Date of birth", "required": True},
                    {"type": "TextInput", "name": "email", "label": "Email (optional)", "input-type": "email", "required": False,
                     "helper-text": "For receipts and your Rehabify dashboard"},
                    {"type": "Footer", "label": "Next", "on-click-action": {
                        "name": "navigate", "next": {"type": "screen", "name": "WHERE_YOU_ARE"}, "payload": {}}},
                ]},
            },
            {
                "id": "WHERE_YOU_ARE",
                "title": "Where you are",
                "data": {},
                "layout": {"type": "SingleColumnLayout", "children": [
                    {"type": "TextHeading", "text": "Where are you based?"},
                    {"type": "TextBody", "text": "We use this to find physiotherapists who can visit you. Online sessions work from anywhere."},
                    {"type": "Dropdown", "name": "state", "label": "State", "data-source": states, "required": True},
                    *area_fields,
                    town_field,
                    {"type": "Footer", "label": "Next", "on-click-action": {
                        "name": "navigate", "next": {"type": "screen", "name": "HEALTH_AND_CONSENT"}, "payload": {}}},
                ]},
            },
            {
                "id": "HEALTH_AND_CONSENT",
                "title": "Almost done",
                "terminal": True,
                "success": True,
                "data": {},
                "layout": {"type": "SingleColumnLayout", "children": [
                    {"type": "TextHeading", "text": "Any health conditions?"},
                    {"type": "CheckboxGroup", "name": "health_conditions", "label": "Optional",
                     "data-source": HEALTH_CONDITIONS, "required": False},
                    {"type": "TextArea", "name": "other_conditions", "label": "Anything else", "required": False,
                     "helper-text": "Optional: other conditions or medicines"},
                    {"type": "OptIn", "name": "accept_terms", "label": "I agree to Rehabify's Terms of Service and Privacy Policy",
                     "required": True, "on-click-action": {"name": "open_url", "url": TERMS_URL}},
                    {"type": "EmbeddedLink", "text": "Read the Privacy Policy", "on-click-action": {"name": "open_url", "url": PRIVACY_URL}},
                    {"type": "Footer", "label": "Finish", "on-click-action": {"name": "complete", "payload": {
                        "form": "signup_v1",
                        "first_name": "${screen.ABOUT_YOU.form.first_name}",
                        "last_name": "${screen.ABOUT_YOU.form.last_name}",
                        "gender": "${screen.ABOUT_YOU.form.gender}",
                        "date_of_birth": "${screen.ABOUT_YOU.form.date_of_birth}",
                        "email": "${screen.ABOUT_YOU.form.email}",
                        "state": "${screen.WHERE_YOU_ARE.form.state}",
                        **{f"area_{_field_key(state)}": f"${{screen.WHERE_YOU_ARE.form.area_{_field_key(state)}}}" for state in zoned},
                        "town": "${screen.WHERE_YOU_ARE.form.town}",
                        "health_conditions": "${form.health_conditions}",
                        "other_conditions": "${form.other_conditions}",
                        "accept_terms": "${form.accept_terms}",
                    }}},
                ]},
            },
        ],
    }


def _field_key(state: str) -> str:
    return "".join(ch for ch in state.lower() if ch.isalnum())


def signup_flow_message(flow_id: str, flow_token: str, *, mode: str = "published") -> dict[str, Any]:
    """The interactive "Get started" flow message (body text is added by the sender)."""
    parameters: dict[str, Any] = {
        "flow_message_version": "3",
        "flow_token": flow_token,
        "flow_id": flow_id,
        "flow_cta": "Get started",
        "flow_action": "navigate",
        "flow_action_payload": {"screen": "ABOUT_YOU"},
    }
    if mode == "draft":
        parameters["mode"] = "draft"
    return {"type": "flow", "action": {"name": "flow", "parameters": parameters}}
