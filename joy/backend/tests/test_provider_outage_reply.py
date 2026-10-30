def test_outage_without_story_never_sends_empty_reply(db_session, patient_phone):
    """With Gemini down and no story yet, the patient still gets a message."""
    from app.conversation.turn_handler import provider_unavailable_reply

    result = provider_unavailable_reply(db_session, patient_phone, "can you help me please")

    assert result.reply_text.strip()
    assert "book" not in result.reply_text.lower()


def test_outage_still_escalates_volunteered_red_flag(db_session, patient_phone):
    from app.conversation.turn_handler import provider_unavailable_reply

    result = provider_unavailable_reply(db_session, patient_phone, "I have chest pain")

    assert result.blocked_by_safety is True
