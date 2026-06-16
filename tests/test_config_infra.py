"""Инфраструктурные настройки Фазы 0: kill-switch, echo от debug, пулы."""
from sqlalchemy.ext.asyncio import AsyncEngine

from messenger.backend.core.config import settings
from messenger.backend.db.session import engine


def test_cache_kill_switch_defaults_on():
    """cache_data_enabled присутствует и по умолчанию включён."""
    assert hasattr(settings, "cache_data_enabled")
    assert settings.cache_data_enabled is True


def test_engine_echo_follows_debug():
    """echo движка управляется settings.debug, а не захардкоженным True."""
    assert isinstance(engine, AsyncEngine)
    assert engine.echo == settings.debug


def test_engine_has_bounded_pool():
    """У движка задан pool_size/max_overflow (не дефолтные безразмерные)."""
    pool = engine.pool
    assert pool.size() == 10
    # max_overflow не имеет публичного геттера у пула — проверяем через _max_overflow
    assert pool._max_overflow == 20
