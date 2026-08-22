from sqlalchemy import select

from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import Persona

LANGUAGES = {
    "en": "My lower back has hurt for two weeks after lifting.",
    "pcm": "My back dey pain me two weeks since I carry heavy load.",
    "yo": "Ẹ̀yìn mi ti ń dun fún ọ̀sẹ̀ méjì.",
    "ig": "Azụ m na-egbu m ụbọchị abụọ izu.",
    "ha": "Bayan na ji zafi tsawon makonni biyu.",
}

_CHECKLIST_PROBES = (
    "when did it start",
    "how bad is it 1-10",
    "any numbness",
)
_LANGUAGE_PICKER = ("please choose english or hausa", "please choose english")


def test_each_language_two_turns_then_memory(db_session, fake_llm):
    from app.conversation.turn_handler import handle_turn
    for lang, line in LANGUAGES.items():
        phone = f"+2348000000{hash(lang) % 100:02d}"
        fake_llm.language = lang
        fake_llm.extraction = {"onset": "2 weeks", "body_location": "back", "condition_area": "msk"}
        first = handle_turn(db_session, phone, line, fake_llm)
        assert first.language == lang
        lower_first = first.reply_text.lower()
        assert not any(probe in lower_first for probe in _CHECKLIST_PROBES)
        assert not any(picker in lower_first for picker in _LANGUAGE_PICKER)
        fake_llm.extraction = {"severity": 6}
        second = handle_turn(db_session, phone, "ok", fake_llm)
        assert second.phase in {"mid_triage", "post_triage"}
        lower_second = second.reply_text.lower()
        assert not any(picker in lower_second for picker in _LANGUAGE_PICKER)
        assert "when did it start?" not in lower_second
        handle_turn(db_session, phone, "still the back", fake_llm)
        from app.identity.resolver import resolve
        from app.conversation.state_manager import load
        identity = resolve(db_session, phone)
        state = load(db_session, identity)
        assert state.extracted.onset == "2 weeks"


def test_symptom_on_unknown_phone_creates_patient_never_physio(db_session, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.identity.resolver import resolve

    phone = "+2348000000188"
    fake_llm.extraction = {
        "onset": "2 weeks",
        "body_location": "back",
        "condition_area": "msk",
    }
    handle_turn(
        db_session,
        phone,
        "My lower back has hurt for two weeks after lifting.",
        fake_llm,
    )
    identity = resolve(db_session, phone)
    assert identity is not None
    assert identity.persona == Persona.PATIENT
    assert db_session.scalar(select(Patient).where(Patient.phone_e164 == phone)) is not None
    assert (
        db_session.scalar(select(Physiotherapist).where(Physiotherapist.phone_e164 == phone))
        is None
    )
