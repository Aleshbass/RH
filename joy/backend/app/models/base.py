from enum import Enum as PyEnum

from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def str_enum(enum_cls: type[PyEnum], name: str) -> SAEnum:
    return SAEnum(
        enum_cls,
        name=name,
        values_callable=lambda members: [m.value for m in members],
        native_enum=False,
        validate_strings=True,
    )


def literal_str_enum(*values: str, name: str) -> SAEnum:
    return SAEnum(*values, name=name, native_enum=False, validate_strings=True)
