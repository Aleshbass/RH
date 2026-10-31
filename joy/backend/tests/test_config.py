from app.config import Settings


def test_database_url_accepts_railway_postgres_scheme():
    settings = Settings(database_url="postgresql://joy:secret@postgres.railway.internal:5432/railway")
    assert settings.database_url.startswith("postgresql+psycopg://")
    assert "joy:secret@postgres.railway.internal:5432/railway" in settings.database_url


def test_database_url_keeps_psycopg_scheme():
    url = "postgresql+psycopg://joy@127.0.0.1:5432/joy"
    assert Settings(database_url=url).database_url == url
