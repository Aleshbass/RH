from dataclasses import dataclass


def _is_true(flags: dict[str, bool | None], key: str) -> bool:
    return flags.get(key) is True


@dataclass(frozen=True)
class RedFlagRule:
    id: str
    reason_plain_language: str
    any_of: tuple[str, ...] = ()
    all_of_groups: tuple[tuple[str, ...], ...] = ()

    def matches(self, flags: dict[str, bool | None]) -> bool:
        if any(_is_true(flags, key) for key in self.any_of):
            return True
        return any(
            group and all(_is_true(flags, key) for key in group)
            for group in self.all_of_groups
        )


RULES: tuple[RedFlagRule, ...] = (
    RedFlagRule(
        id="cauda_equina",
        any_of=(
            "saddle_anesthesia",
            "bladder_bowel_change",
            "bilateral_leg_weakness",
        ),
        reason_plain_language=(
            "Numbness around the saddle area, a change in bladder or bowel control, "
            "or weakness in both legs can mean the nerves at the base of the spine "
            "are under dangerous pressure."
        ),
    ),
    RedFlagRule(
        id="infection",
        any_of=("fever", "night_sweats"),
        reason_plain_language=(
            "Fever or night sweats with this kind of illness can mean an infection "
            "that needs a medical assessment right away."
        ),
    ),
    RedFlagRule(
        id="malignancy_screen",
        any_of=("unexplained_weight_loss",),
        all_of_groups=(("history_of_cancer", "night_pain"),),
        reason_plain_language=(
            "Unexplained weight loss, or a past cancer together with pain that wakes "
            "you at night, can be a warning that needs a doctor to check promptly."
        ),
    ),
    RedFlagRule(
        id="major_trauma",
        any_of=("recent_trauma",),
        reason_plain_language=(
            "A recent injury that makes it hard to stand or walk can mean a serious "
            "fracture or other damage that needs urgent medical care."
        ),
    ),
    RedFlagRule(
        id="cardiac",
        any_of=("chest_pain",),
        reason_plain_language=(
            "Chest pain can be a sign of a heart problem that needs urgent medical "
            "care rather than a delayed check."
        ),
    ),
    RedFlagRule(
        id="acute_neuro",
        any_of=("sudden_neuro_deficit", "unexplained_numbness"),
        reason_plain_language=(
            "A sudden change in strength, speech, or feeling, or unexplained numbness, "
            "can mean the brain or nerves need emergency care."
        ),
    ),
)
