"""Home-visit safety messages from RH (homeVisitSafety.ts): visit.on_the_way and safety.notify."""

from app.api.internal.rh_events import safety_recipients, visit_on_the_way_text


def test_the_patient_gets_the_photo_link_licence_and_code():
    text = visit_on_the_way_text({
        "physio_name": "Bisi Okafor",
        "physio_first_name": "Bisi",
        "licence_number": "MRTB/12345",
        "door_code": "0427",
        "start_time": 1_763_200_800_000,
        "page_url": "https://physioaroundme.com/visit/abc",
    })
    assert "Bisi Okafor is on the way" in text
    assert "https://physioaroundme.com/visit/abc" in text
    assert "MRTB/12345" in text
    assert "*0427*" in text
    assert "Only give the code to the person in the photo" in text


def test_a_link_that_is_not_https_is_left_out():
    text = visit_on_the_way_text({"physio_name": "Bisi", "door_code": "1234", "page_url": "javascript:alert(1)"})
    assert "javascript" not in text
    assert "*1234*" in text


def test_the_code_is_digits_only():
    text = visit_on_the_way_text({"physio_name": "Bisi", "door_code": "12*34_"})
    assert "*1234*" in text


def test_safety_recipients_are_e164_numbers_without_repeats():
    phones = safety_recipients(["+2348012345678", "+2348012345678", "08012345678", "+23480abc", None, "+447700900123"])
    assert phones == ["+2348012345678", "+447700900123"]


def test_safety_recipients_are_capped_and_need_a_list():
    assert safety_recipients("+2348012345678") == []
    many = [f"+23480100000{i:02d}" for i in range(20)]
    assert len(safety_recipients(many)) == 10
