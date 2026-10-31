"""nullable physiotherapist city for segmented broadcasts

Revision ID: 0017_physio_city
Revises: 0016_admin
Create Date: 2026-08-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0017_physio_city"
down_revision: Union[str, Sequence[str], None] = "0016_admin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("physiotherapists", sa.Column("city", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("physiotherapists", "city")
