import pytest

from app.conversation.turn_handler import _is_summary_confirm


@pytest.mark.parametrize(
    "text",
    [
        "Yh this is right",
        "Confirmed",
        "this is right",
        "ok",
        "okay",
        "sounds good",
        "yes that's correct",
        "yep",
        "that's right",
        "confirm",
    ],
)
def test_summary_confirm_phrases(text: str):
    assert _is_summary_confirm(text) is True


@pytest.mark.parametrize(
    "text",
    [
        "that's not correct",
        "not right",
        "my right knee hurts more",
        "Hey Joy",
        "",
        "please correct the onset to 2 weeks",
    ],
)
def test_summary_non_confirm_phrases(text: str):
    assert _is_summary_confirm(text) is False
