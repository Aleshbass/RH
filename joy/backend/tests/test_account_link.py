"""Linking a WhatsApp number to a Rehabify website account (LINK, then an emailed code).

Joy must never attach a chat to a website account on a phone match alone: the owner proves
control of the account's mailbox by sending back the code RH emailed.
"""

import httpx
import pytest
from sqlalchemy import select

from app.integrations.rh_client import RHActor, RHClient
from app.models.conversation import Conversation
from app.models.rh_identity_mapping import RHIdentityMapping


class _FakeRH:
    def __init__(self, *, request=None, confirm=None):
        self.request_result = request or {"sent": True, "email_hint": "ad***@g***.com"}
        self.confirm_result = confirm or {"linked": True, "patient_id": "account-1", "display_name": "Ada"}
        self.calls: list[tuple] = []

    def request_account_link(self, *, patient_id, actor):
        self.calls.append(("request", patient_id, actor.sender_phone))
        return self.request_result

    def confirm_account_link(self, *, patient_id, code, actor):
        self.calls.append(("confirm", patient_id, code))
        return self.confirm_result


@pytest.fixture
def linked_setup(db_session, patient_identity, monkeypatch):
    db_session.add(RHIdentityMapping(persona="patient", joy_person_id=patient_identity.person_id, rh_record_id="placeholder-1"))
    db_session.flush()
    fake = _FakeRH()
    monkeypatch.setattr("app.conversation.turn_handler.configured_rh_client", lambda: fake)
    return fake


def _mapping(db_session, patient_identity):
    return db_session.scalar(select(RHIdentityMapping).where(
        RHIdentityMapping.persona == "patient", RHIdentityMapping.joy_person_id == patient_identity.person_id,
    ))


def test_link_then_code_links_the_account(db_session, patient_identity, fake_llm, linked_setup):
    from app.conversation.turn_handler import handle_turn

    first = handle_turn(db_session, patient_identity.phone_e164, "LINK", fake_llm)
    assert "emailed a 6-digit code to ad***@g***.com" in first.reply_text
    assert linked_setup.calls == [("request", "placeholder-1", patient_identity.phone_e164)]

    second = handle_turn(db_session, patient_identity.phone_e164, "123 456", fake_llm)
    assert second.reply_text.startswith("Done.")
    assert linked_setup.calls[-1] == ("confirm", "placeholder-1", "123456")
    assert _mapping(db_session, patient_identity).rh_record_id == "account-1"


def test_wrong_code_keeps_waiting_for_the_right_one(db_session, patient_identity, fake_llm, linked_setup):
    from app.conversation.turn_handler import handle_turn

    linked_setup.confirm_result = {"linked": False, "reason": "wrong_code", "attempts_left": 3}
    handle_turn(db_session, patient_identity.phone_e164, "link my account", fake_llm)
    reply = handle_turn(db_session, patient_identity.phone_e164, "000000", fake_llm)
    assert "doesn't match" in reply.reply_text
    assert _mapping(db_session, patient_identity).rh_record_id == "placeholder-1"
    row = db_session.scalar(select(Conversation).where(Conversation.person_id == patient_identity.person_id))
    assert "account_link_pending_until" in (row.booking_context or {})


def test_six_digits_without_a_pending_link_is_not_treated_as_a_code(db_session, patient_identity, fake_llm, linked_setup):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "Tell me more."
    handle_turn(db_session, patient_identity.phone_e164, "123456", fake_llm)
    assert not any(call[0] == "confirm" for call in linked_setup.calls)


def test_no_email_on_account_explains_how_to_get_help(db_session, patient_identity, fake_llm, linked_setup):
    from app.conversation.turn_handler import handle_turn

    linked_setup.request_result = {"sent": False, "reason": "no_email"}
    reply = handle_turn(db_session, patient_identity.phone_e164, "LINK", fake_llm)
    assert "hello@myrehabifyhealth.com" in reply.reply_text
    row = db_session.scalar(select(Conversation).where(Conversation.person_id == patient_identity.person_id))
    assert "account_link_pending_until" not in (row.booking_context or {})


def test_resolve_offers_the_link_once_when_rh_finds_an_unlinked_account(db_session, patient_identity, monkeypatch):
    from app.booking import booking_flow
    from app.integrations.rh_client import PatientResolution
    from app.models.patient import Patient

    class _Resolver:
        def resolve_patient(self, *args, **kwargs):
            return PatientResolution(
                resolution="CREATED", patient_id="placeholder-9",
                account_link_available=True, account_email_hint="ad***@g***.com",
            )

    sent: list[str] = []
    monkeypatch.setattr(booking_flow, "configured_rh_client", lambda: _Resolver())
    monkeypatch.setattr(booking_flow, "enqueue_booking_confirmed", lambda phone, booking_id, text, **_: sent.append(text))
    patient = db_session.get(Patient, patient_identity.person_id)

    assert booking_flow._rh_patient_id(db_session, patient) == "placeholder-9"
    assert booking_flow._rh_patient_id(db_session, patient) == "placeholder-9"  # mapped: no second offer
    assert len(sent) == 1 and "reply LINK" in sent[0] and "ad***@g***.com" in sent[0]


def test_rh_client_reads_the_link_offer_from_resolve():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"request_id": request.headers["X-Request-Id"], "data": {
            "resolution": "CREATED", "patient_id": "p-1",
            "account_link_available": True, "account_email_hint": "ad***@g***.com",
        }})

    client = RHClient("https://rh.test", "joy-test", "adapter-secret", client=httpx.Client(transport=httpx.MockTransport(handler)))
    resolved = client.resolve_patient("+2348000004001", "joy-1", RHActor(persona="patient", sender_phone="+2348000004001"))
    assert resolved.account_link_available is True
    assert resolved.account_email_hint == "ad***@g***.com"
