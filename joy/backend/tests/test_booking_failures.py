"""Confirm and pay / payment start failures tell the truth and never strand the patient.

12 Nov 2026: Rehabify refused to hold a physio Joy had shown ("not eligible"); Joy said "That time
has just been taken" twice, told nobody, and the patient never got a payment link. No database
needed: the booking steps run on plain objects with RH, the audit log and alerts stubbed.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.booking import booking_flow as bf
from app.integrations.rh_client import RHIntegrationError

FUTURE_MS = int((datetime.now(timezone.utc) + timedelta(days=1)).timestamp() * 1000)
PROVIDERS = [
    {"physiotherapist_id": "pA", "display_name": "Ada Obi", "next_slot_start": FUTURE_MS, "amount_kobo": 600_000},
    {"physiotherapist_id": "pB", "display_name": "Tolu Bello", "next_slot_start": FUTURE_MS + 3_600_000, "amount_kobo": 600_000},
]


class FakeRH:
    uses_direct_convex_gateway = False

    def __init__(self, *, hold_error=None, payment_error=None, slots=None):
        self.hold_error, self.payment_error = hold_error, payment_error
        self.slots = [{"start": FUTURE_MS + 7_200_000}] if slots is None else slots
        self.payment_emails = []

    def create_pending_booking(self, **kwargs):
        raise RHIntegrationError(self.hold_error, "refused")

    def availability(self, provider_id, **kwargs):
        return {"slots": self.slots}

    def initialize_booking_payment(self, booking_id, *, patient_id, email, actor, idempotency_key):
        self.payment_emails.append(email)
        raise RHIntegrationError(self.payment_error, "refused")


@pytest.fixture
def alerts(monkeypatch):
    sent = []
    monkeypatch.setattr(bf, "append", lambda *a, **k: None)
    monkeypatch.setattr(bf, "journey", lambda *a, **k: None)
    monkeypatch.setattr(bf, "object_session", lambda _obj: None, raising=False)
    monkeypatch.setattr(bf, "_current_assessment", lambda *_: "triage-1")
    monkeypatch.setattr(bf, "alert_booking_failure", lambda *a, **k: sent.append(k))
    return sent


def use(monkeypatch, fake):
    monkeypatch.setattr(bf, "configured_rh_client", lambda: fake)


def conversation(substate, **ctx):
    base = {
        "booking_route": bf.NAMED_ROUTE, "rh_patient_id": "K57ABC", "providers": [dict(p) for p in PROVIDERS],
        "providers_shown": 2, "selected_provider": dict(PROVIDERS[0]),
        "selected_slot": {"start": FUTURE_MS, "end": FUTURE_MS + 1_200_000},
        "sr_policy": {"version": "v1", "url": "https://example.test/policy"},
    }
    return SimpleNamespace(id="c1", booking_context={**base, **ctx}, booking_substate=substate)


def patient():
    return SimpleNamespace(email=None, phone_e164="+2348030000000", id="p1", preferred_language="en", location=None)


SESSION = SimpleNamespace(flush=lambda: None)


def test_not_eligible_is_never_called_taken_and_the_care_team_hears(monkeypatch, alerts):
    use(monkeypatch, FakeRH(hold_error="PROVIDER_NOT_ELIGIBLE"))
    conv = conversation(bf.AWAITING_RH_CONFIRM)
    reply = bf._hold_named_slot(SESSION, conv, patient(), None, conv.booking_context, "wamid.1")
    assert "taken" not in reply.casefold()
    assert "couldn't book Ada Obi" in reply and "nothing has been booked or charged" in reply
    assert alerts and alerts[0]["code"] == "PROVIDER_NOT_ELIGIBLE"
    # The patient can choose someone else straight away; the refused physio is gone from the list
    assert conv.booking_substate == bf.AWAITING_RH_NAMED_PROVIDER
    assert [p["physiotherapist_id"] for p in conv.booking_context["providers"]] == ["pB"]
    assert "Tolu Bello" in reply and "Ada Obi*" not in reply


def test_slot_taken_offers_other_times_without_keeping_the_lost_one(monkeypatch, alerts):
    use(monkeypatch, FakeRH(hold_error="SLOT_TAKEN"))
    conv = conversation(bf.AWAITING_RH_CONFIRM)
    reply = bf._hold_named_slot(SESSION, conv, patient(), None, conv.booking_context, "wamid.1")
    assert reply.startswith("That time has just been taken")
    assert conv.booking_substate == bf.AWAITING_RH_OTHER_TIME
    assert "selected_slot" not in conv.booking_context
    assert "Back* to keep" not in reply and "another physio" in reply
    assert not alerts  # a taken time is normal, not a fault


def test_back_after_a_lost_time_returns_to_the_physio_list(monkeypatch, alerts):
    use(monkeypatch, FakeRH())
    conv = conversation(bf.AWAITING_RH_OTHER_TIME, slots=[{"start": FUTURE_MS + 7_200_000}])
    conv.booking_context.pop("selected_slot")
    reply = bf._continue_other_time(SESSION, conv, patient(), "back")
    assert conv.booking_substate == bf.AWAITING_RH_NAMED_PROVIDER
    assert "Ada Obi" in reply and "Tolu Bello" in reply


def test_lost_hold_at_payment_offers_other_times_instead_of_try_again_for_ever(monkeypatch, alerts):
    use(monkeypatch, FakeRH(payment_error="HOLD_EXPIRED"))
    conv = conversation(bf.AWAITING_RH_PAYMENT_EMAIL, rh_booking_id="bk1")
    reply = bf._continue_rh_payment_email(SESSION, conv, patient(), "whatsapp is fine")
    assert "the time I was holding for you has gone" in reply and "try again" not in reply.casefold()
    assert conv.booking_substate == bf.AWAITING_RH_OTHER_TIME
    assert "rh_booking_id" not in conv.booking_context


def test_other_payment_failures_alert_once_and_pay_retries_with_the_same_email(monkeypatch, alerts):
    fake = FakeRH(payment_error="PAYMENT_INITIALIZATION_FAILED")
    use(monkeypatch, fake)
    conv = conversation(bf.AWAITING_RH_PAYMENT_EMAIL, rh_booking_id="bk1")
    first = bf._continue_rh_payment_email(SESSION, conv, patient(), "ada@gmail.com")
    assert "*PAY*" in first and len(alerts) == 1
    bf._continue_rh_payment_email(SESSION, conv, patient(), "PAY")
    assert fake.payment_emails == ["ada@gmail.com", "ada@gmail.com"]
    assert len(alerts) == 1  # the care team is told once, not on every retry
