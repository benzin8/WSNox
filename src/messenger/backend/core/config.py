import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import computed_field

from messenger import PROJECT_ROOT

class Settings(BaseSettings):
    db_user: str
    db_pass: str
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_name: str
    
    secret_key: str
    algorithm: str
    redis_url: str

    DOCKER_MODE: bool = os.getenv("DOCKER_MODE", "false").lower() == "true"

    @computed_field
    @property
    def database_url(self) -> str:
        return f"mysql+aiomysql://{self.db_user}:{self.db_pass}@{self.db_host}:{self.db_port}/{self.db_name}"

    @computed_field
    @property
    def redis_host(self) -> str:
        if self.DOCKER_MODE:
            return "redis://redis:6379/0"
        return "redis://localhost:6379/0"
    
    model_config = SettingsConfigDict(
        env_file=os.path.join(PROJECT_ROOT, ".env"),
        extra="ignore" # Ignore extra env vars
    )

settings = Settings()