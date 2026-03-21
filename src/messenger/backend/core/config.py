import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    db_user: str
    db_pass: str
    db_host: str
    db_port: int
    db_name: str
    
    secret_key: str
    algorithm: str
    redis_url: str

    DOCKER_MODE: bool = os.getenv("DOCKER_MODE", "false").lower() == "true"

    @property
    def db_host(self) -> str:
        if self.DOCKER_MODE:
            return "db" 
        return "127.0.0.1" 

    @property
    def redis_host(self) -> str:
        if self.DOCKER_MODE:
            return "redis" 
        return "127.0.0.1" 

    @property
    def database_url(self) -> str:
        return f"mysql+aiomysql://{self.db_user}:{self.db_pass}@{self.db_host}:{self.db_port}/{self.db_name}"
    
    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()