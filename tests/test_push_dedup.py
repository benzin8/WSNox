"""Cross-worker push de-duplication in `_fanout_offline_pushes`.

Every uvicorn worker's pubsub listener runs the offline push fan-out, so without
guards a message could be pushed once per worker, and a user connected to one
worker would be pushed by the others (looking "offline" in their local
`active_connections`). These lock in: at most one push per message, and no push
to a user who is online anywhere per Redis presence.
"""
import asyncio
from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from messenger.backend.app.ws import router as router_mod
from messenger.backend.app.ws.presence import set_presence


class _Session:
    async def __aenter__(self):
        return MagicMock(name="session")

    async def __aexit__(self, *a):
        return False


def _patched(mgr, fake_redis, send):
    stack = ExitStack()
    stack.enter_context(patch.object(router_mod, "AsyncSessionLocal", lambda: _Session()))
    stack.enter_context(patch.object(router_mod, "get_redis", return_value=fake_redis))
    stack.enter_context(patch.object(router_mod, "send_push_to_user", send))
    stack.enter_context(patch.object(mgr, "_should_push", new=AsyncMock(return_value=True)))
    return stack


async def _fanout(mgr, recipient_ids, message_id):
    await mgr._fanout_offline_pushes(
        recipient_ids=recipient_ids,
        chat_id=7,
        chat_info={"chat_type": "private"},
        sender_id=99,
        sender_display_name="Bob",
        decrypted_text="hi",
        message_id=message_id,
    )
    await asyncio.sleep(0)  # let the fire-and-forget push task settle


@pytest.mark.asyncio
async def test_same_message_pushes_once_across_workers(fake_redis):
    mgr = router_mod.ConnectionManager()
    mgr.active_connections = {}
    send = AsyncMock()
    with _patched(mgr, fake_redis, send):
        await _fanout(mgr, [1], message_id=555)  # worker A
        await _fanout(mgr, [1], message_id=555)  # worker B, same message
    assert send.call_count == 1


@pytest.mark.asyncio
async def test_recipient_online_on_another_worker_not_pushed(fake_redis):
    mgr = router_mod.ConnectionManager()
    mgr.active_connections = {}        # not connected to THIS worker...
    await set_presence(fake_redis, 1)  # ...but present (online) elsewhere
    send = AsyncMock()
    with _patched(mgr, fake_redis, send):
        await _fanout(mgr, [1], message_id=556)
    assert send.call_count == 0


@pytest.mark.asyncio
async def test_offline_recipient_pushed_once(fake_redis):
    mgr = router_mod.ConnectionManager()
    mgr.active_connections = {}
    send = AsyncMock()
    with _patched(mgr, fake_redis, send):
        await _fanout(mgr, [1], message_id=557)
    assert send.call_count == 1
