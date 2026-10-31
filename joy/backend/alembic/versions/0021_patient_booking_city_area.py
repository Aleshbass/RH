"""Persist structured city and area for Joy booking matching.

Revision ID: 0021_patient_booking_city_area
Revises: 0020_rh_integration_events
"""

import sqlalchemy as sa
from alembic import op


revision = "0021_patient_booking_city_area"
down_revision = "0020_rh_integration_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("city", sa.String(), nullable=True))
    op.add_column("patients", sa.Column("area", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("patients", "area")
    op.drop_column("patients", "city")
