"""Birthday wishes and care milestones from the care team reach the patient on WhatsApp (20 Nov 2026).

Text only: no Redis, database or network.
"""
from app.api.internal.rh_events import care_moment_text


def test_a_birthday_wish_reads_like_the_care_team_wrote_it():
    text = care_moment_text({"kind": "birthday", "title": "Happy birthday, Ada", "message": "Wishing you a lovely day!", "sender_name": "Lagos Physio Clinic"})
    assert text.startswith("🎉 *Happy birthday, Ada*")
    assert "Wishing you a lovely day!" in text
    assert text.endswith("From Lagos Physio Clinic")


def test_a_milestone_gets_its_own_icon_and_a_default_sender():
    text = care_moment_text({"kind": "care_anniversary", "title": "A year with us", "message": "Thank you for trusting us.", "sender_name": ""})
    assert text.startswith("💚 *A year with us*")
    assert text.endswith("From Your care team")


def test_nothing_is_sent_without_a_message():
    assert care_moment_text({"kind": "birthday", "title": "Happy birthday", "message": "  "}) == ""
