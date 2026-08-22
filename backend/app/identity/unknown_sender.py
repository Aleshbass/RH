from sqlalchemy.orm import Session

_UNKNOWN_SENDER_QUESTION = (
    "Are you looking for physiotherapy care, are you a physiotherapist, "
    "or did a family member add you here?"
)


def begin_unknown(session: Session, phone_e164: str) -> str:
    del session, phone_e164
    return _UNKNOWN_SENDER_QUESTION
