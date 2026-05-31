"""Unit-тесты для services/analytics.py — чистые функции с моками сессии."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from messenger.backend.services.analytics import (
    dau_series,
    kpi_dau,
    kpi_msgs,
    kpi_users,
    labels_series,
    live_msgs_per_min,
    live_online,
    msg_series,
    pct_change,
    reg_series,
)

NOW = datetime(2026, 5, 31, tzinfo=timezone.utc)


# --- pct_change ---

def test_pct_change_positive():
    assert pct_change(150, 100) == 50.0


def test_pct_change_negative():
    assert pct_change(80, 100) == -20.0


def test_pct_change_zero_base():
    assert pct_change(100, 0) == 0.0


def test_pct_change_zero_zero():
    assert pct_change(0, 0) == 0.0


def test_pct_change_rounded_to_one_decimal():
    assert pct_change(103, 100) == 3.0
    assert pct_change(1037, 1000) == 3.7


# --- labels_series ---

def test_labels_series_length():
    assert len(labels_series(now=NOW)) == 90


def test_labels_series_format():
    labels = labels_series(now=NOW)
    assert labels[-1] == "31.5"
    # 90 дней назад: 31 мая - 89 дней = 3 марта
    assert labels[0] == "3.3"


# --- reg/msg series ---

def _mock_session_returning_rows(rows):
    session = MagicMock()
    result = MagicMock()
    result.all = MagicMock(return_value=rows)
    session.execute = AsyncMock(return_value=result)
    return session


@pytest.mark.asyncio
async def test_reg_series_length_and_zero_padding():
    today = NOW.date()
    rows = [
        (today, 5),
        (today - timedelta(days=1), 3),
        (today - timedelta(days=10), 7),
    ]
    session = _mock_session_returning_rows(rows)
    series = await reg_series(session, now=NOW)
    assert len(series) == 90
    assert series[-1] == 5
    assert series[-2] == 3
    assert series[-11] == 7
    assert series[0] == 0
    assert sum(series) == 15


@pytest.mark.asyncio
async def test_msg_series_uses_message_table():
    session = _mock_session_returning_rows([])
    series = await msg_series(session, now=NOW)
    assert len(series) == 90
    assert all(x == 0 for x in series)
    session.execute.assert_called_once()


@pytest.mark.asyncio
async def test_dau_series_returns_90_values():
    today = NOW.date()
    rows = [
        (today, 120),
        (today - timedelta(days=5), 95),
    ]
    session = _mock_session_returning_rows(rows)
    series = await dau_series(session, now=NOW)
    assert len(series) == 90
    assert series[-1] == 120
    assert series[-6] == 95


# --- kpi blocks ---

def _mock_session_scalars(values):
    """session.execute().scalar() возвращает значения из values по порядку."""
    iterator = iter(values)
    session = MagicMock()
    result = MagicMock()
    result.scalar = MagicMock(side_effect=lambda: next(iterator))
    session.execute = AsyncMock(return_value=result)
    return session


@pytest.mark.asyncio
async def test_kpi_users_returns_total_deltas_and_details():
    # order: total, (7d cur, 7d prev), (30d cur, 30d prev), (90d cur, 90d prev), today
    session = _mock_session_scalars([
        12847,
        628, 530,
        2184, 1538,
        7300, 3200,
        85,  # today
    ])
    kpi = await kpi_users(session, now=NOW)
    assert kpi["total"] == 12847
    assert kpi["deltas"] == {
        "7": round((628 - 530) / 530 * 100, 1),
        "30": round((2184 - 1538) / 1538 * 100, 1),
        "90": round((7300 - 3200) / 3200 * 100, 1),
    }
    assert kpi["details"] is not None
    labels = [d["label"] for d in kpi["details"]]
    assert labels == ["Сегодня", "За 7 дней", "За 30 дней", "Ср. в день"]


@pytest.mark.asyncio
async def test_kpi_msgs_smoke():
    session = _mock_session_scalars([100, 10, 5, 30, 20, 90, 60, 7])
    kpi = await kpi_msgs(session, now=NOW)
    assert kpi["total"] == 100
    assert set(kpi["deltas"].keys()) == {"7", "30", "90"}
    assert kpi["details"] is not None
    assert len(kpi["details"]) == 4


@pytest.mark.asyncio
async def test_kpi_dau_with_real_mau():
    # order: DAU, WAU, MAU, (7d cur, prev), (30d cur, prev), (90d cur, prev)
    session = _mock_session_scalars([
        120,  # DAU
        220,  # WAU
        400,  # MAU
        100, 80,
        300, 250,
        500, 400,
    ])
    kpi = await kpi_dau(session, now=NOW)
    assert kpi["value"] == 120
    assert kpi["mau"] == 400
    assert kpi["stickiness"] == 30.0
    assert set(kpi["deltas"].keys()) == {"7", "30", "90"}
    assert kpi["details"] is not None
    labels = [d["label"] for d in kpi["details"]]
    assert labels == ["DAU", "WAU", "MAU", "Stickiness"]


@pytest.mark.asyncio
async def test_kpi_dau_mau_zero_yields_zero_stickiness():
    session = _mock_session_scalars([0] * 9)
    kpi = await kpi_dau(session, now=NOW)
    assert kpi["stickiness"] == 0.0


# --- live ---

@pytest.mark.asyncio
async def test_live_online_counts_presence_keys(fake_redis):
    await fake_redis.setex("presence:1", 60, "1")
    await fake_redis.setex("presence:42", 60, "1")
    await fake_redis.setex("presence:100", 60, "1")
    assert await live_online(fake_redis) == 3


@pytest.mark.asyncio
async def test_live_online_empty(fake_redis):
    assert await live_online(fake_redis) == 0


@pytest.mark.asyncio
async def test_live_msgs_per_min_returns_count():
    session = _mock_session_scalars([47])
    count = await live_msgs_per_min(session, now=NOW)
    assert count == 47
