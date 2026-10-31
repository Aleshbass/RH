"""unique (person_id, persona) on conversations

Revision ID: 0001b
Revises: 0001_baseline
Create Date: 2026-08-22

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0001b"
down_revision: Union[str, Sequence[str], None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_conversations_person_id_persona",
        "conversations",
        ["person_id", "persona"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_conversations_person_id_persona",
        "conversations",
        type_="unique",
    )
