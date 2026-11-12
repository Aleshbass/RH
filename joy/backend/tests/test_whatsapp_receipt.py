"""Patients without email: "WhatsApp is fine" starts payment, and the receipt comes on WhatsApp.

No database needed: the booking step runs on plain objects with RH and the audit log stubbed.
"""
from types import SimpleNamespace

import pytest

from app.booking import booking_flow as bf
from app.integrations.rh_client import RHPaymentInitialization


class FakeRH:
    def __init__(self):
        self.calls = []

    def initialize_booking_payment(self, booking_id, *, patient_id, email, actor, idempotency_key):
        self.calls.append({"booking_id": booking_id, "patient_id": patient_id, "email": email})
        return RHPaymentInitialization(booking_id=booking_id, reference="ref", authorization_url="https://pay.example/x", payment_status="pending")


@pytest.fixture
def rh(monkeypatch):
    fake = FakeRH()
    monkeypatch.setattr(bf, "configured_rh_client", lambda: fake)
    monkeypatch.setattr(bf, "append", lambda *a, **k: None)
    monkeypatch.setattr(bf, "journey", lambda *a, **k: None)
    monkeypatch.setattr(bf, "object_session", lambda _obj: None, raising=False)
    return fake


def conversation(**ctx):
    base = {"rh_booking_id": "bk1", "rh_patient_id": "K57ABC", "rh_amount_kobo": 600_000}
    return SimpleNamespace(booking_context={**base, **ctx}, booking_substate=bf.AWAITING_RH_PAYMENT_EMAIL)


def patient(email=None):
    return SimpleNamespace(email=email, phone_e164="+2348030000000", id="p1")


def test_private_address_matches_rehabify_and_never_uses_the_phone():
    address = bf.whatsapp_receipt_address("K57ABC")
    assert address == "wa-k57abc@patients.physioaroundme.com"  # lib/auth/joyLoginEmail.ts joyLoginEmail
    assert "803" not in address


@pytest.mark.parametrize("text", ["whatsapp is fine", "WhatsApp is fine", "No email", "I don't have email", "none", "whatsapp"])
def test_whatsapp_choices(text):
    assert bf.wants_whatsapp_receipt(text)


@pytest.mark.parametrize("text", ["ada@gmail.com", "yes", "add my email"])
def test_not_whatsapp_choices(text):
    assert not bf.wants_whatsapp_receipt(text)


def test_whatsapp_is_fine_starts_payment_with_the_private_address(rh):
    conv, pat = conversation(), patient()
    reply = bf._continue_rh_payment_email(None, conv, pat, "whatsapp is fine")
    assert rh.calls[0]["email"] == "wa-k57abc@patients.physioaroundme.com"
    assert "https://pay.example/x" in reply and "receipt will come here on WhatsApp" in reply
    assert conv.booking_context["payment_email"] is None  # nothing is ever emailed to it
    assert conv.booking_context["receipt_by"] == "whatsapp"
    assert pat.email is None  # the private address is never saved as theirs
    assert conv.booking_substate == bf.AWAITING_RH_PAYMENT


def test_a_real_email_still_works(rh):
    conv, pat = conversation(), patient()
    reply = bf._continue_rh_payment_email(None, conv, pat, "Ada@Gmail.com")
    assert rh.calls[0]["email"] == "ada@gmail.com"
    assert conv.booking_context["receipt_by"] == "email" and pat.email == "ada@gmail.com"
    assert "receipt will come here" not in reply


def test_add_my_email_asks_them_to_type_it(rh):
    reply = bf._continue_rh_payment_email(None, conversation(), patient(), "add my email")
    assert "Type the email" in reply and not rh.calls


def test_plain_no_to_a_suggested_email_asks_again(rh):
    reply = bf._continue_rh_payment_email(None, conversation(suggested_email="ada@gmail.com"), patient("ada@gmail.com"), "no")
    assert "WhatsApp is fine" in reply and not rh.calls


def test_plain_no_without_an_email_means_whatsapp(rh):
    bf._continue_rh_payment_email(None, conversation(), patient(), "no")
    assert rh.calls[0]["email"].endswith("@patients.physioaroundme.com")


def test_pay_after_a_failed_payment_reuses_whatsapp(rh):
    bf._continue_rh_payment_email(None, conversation(receipt_by="whatsapp", payment_retry_count=1), patient(), "PAY")
    assert rh.calls[0]["email"].endswith("@patients.physioaroundme.com")


def test_garbage_gets_a_helpful_nudge(rh):
    reply = bf._continue_rh_payment_email(None, conversation(), patient(), "hello")
    assert "WhatsApp is fine" in reply and not rh.calls


def test_the_private_address_is_never_suggested_or_accepted(rh):
    assert bf._known_email(patient("wa-k57abc@patients.physioaroundme.com")) is None
    reply = bf._continue_rh_payment_email(None, conversation(), patient(), "wa-k57abc@patients.physioaroundme.com")
    assert not rh.calls and "WhatsApp is fine" in reply


def test_the_question_offers_both():
    assert "WhatsApp is fine" in bf.receipt_question("Your time is held.", None)
    with_email = bf.receipt_question("Your time is held.", "ada@gmail.com")
    assert "ada@gmail.com" in with_email and "WhatsApp is fine" in with_email
