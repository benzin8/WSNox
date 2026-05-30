import os

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

from messenger import PROJECT_ROOT


class Settings(BaseSettings):
    db_user: str
    db_pass: str
    db_host: str = "127.0.0.1"
    db_port: int = 5432
    db_name: str
    
    secret_key: str
    jwt_secret_key: str = ""
    message_encryption_key: str = ""
    algorithm: str
    redis_url: str
    debug: bool = False

    smtp_host: str = "smtp.yandex.ru"
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""

    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_mailto: str = "mailto:admin@wsnox.app"

    frontend_base_url: str = "https://wsnox.urldot.ru"

    s3_endpoint_url: str = "https://storage.yandexcloud.net"
    s3_region: str = "ru-central1"
    s3_bucket: str = ""
    s3_prefix: str = "dev"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""

    DOCKER_MODE: bool = os.getenv("DOCKER_MODE", "false").lower() == "true"

    @computed_field
    @property
    def database_url(self) -> str:
        return f"postgresql+psycopg://{self.db_user}:{self.db_pass}@{self.db_host}:{self.db_port}/{self.db_name}"

    @computed_field
    @property
    def redis_host(self) -> str:
        return self.redis_url
    
    model_config = SettingsConfigDict(
        env_file=os.path.join(PROJECT_ROOT, ".env"),
        extra="ignore" # Ignore extra env vars
    )

settings = Settings()