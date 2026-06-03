import { useState, useEffect } from 'react';
import axios from 'axios';
import { getAccounts, getActiveId, mintAccess } from './accountStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Returns { accounts, activeId, unread } where `unread` maps user_id -> number.
// Unread totals are fetched per account using that account's own token when
// the hook mounts (i.e. when the profile modal opens).
export function useAccounts(enabled) {
  const [accounts] = useState(getAccounts);
  const [activeId] = useState(getActiveId);
  const [unread, setUnread] = useState({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    Promise.all(
      accounts.map(async (acc) => {
        try {
          // Active account uses the in-hand access token; others mint a fresh
          // short-lived one from their httpOnly refresh cookie.
          let token;
          if (acc.user_id === activeId) {
            token = localStorage.getItem('access_token');
          } else {
            token = await mintAccess(acc.user_id);
          }
          if (!token) return [acc.user_id, null];
          const res = await axios.get(`${API_BASE}/chats/unread-total`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return [acc.user_id, res.data.unread_total];
        } catch {
          // 401 / network — no badge for this account.
          return [acc.user_id, null];
        }
      })
    ).then((pairs) => {
      if (cancelled) return;
      const map = {};
      for (const [id, total] of pairs) if (total != null) map[id] = total;
      setUnread(map);
    });

    return () => { cancelled = true; };
  }, [enabled, accounts]);

  return { accounts, activeId, unread };
}
