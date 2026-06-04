import { useState, useEffect } from 'react';
import axios from 'axios';
import { getAccounts, getActiveId, mintAccess } from './accountStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Returns { accounts, activeId } where each account is enriched with a FRESH
// display_name + avatar_url + unread count, fetched when the profile modal
// opens. Stored metadata is only a fallback: login-added accounts have no
// avatar, and avatar URLs are short-lived presigned links that expire — so the
// switcher must resolve them live per account (using that account's token).
export function useAccounts(enabled) {
  const [stored] = useState(getAccounts);
  const [activeId] = useState(getActiveId);
  const [accounts, setAccounts] = useState(() =>
    stored.map((a) => ({ ...a, unread: null }))
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    Promise.all(
      stored.map(async (acc) => {
        try {
          const token =
            acc.user_id === activeId
              ? localStorage.getItem('access_token')
              : await mintAccess(acc.user_id);
          if (!token) return { ...acc, unread: null };
          const headers = { Authorization: `Bearer ${token}` };
          const [profileRes, unreadRes] = await Promise.all([
            axios.get(`${API_BASE}/profiles/me`, { headers }).catch(() => null),
            axios.get(`${API_BASE}/chats/unread-total`, { headers }).catch(() => null),
          ]);
          return {
            ...acc,
            display_name: profileRes?.data?.display_name || acc.display_name,
            avatar_url: profileRes?.data?.avatar_thumb_url ?? acc.avatar_url,
            unread: unreadRes ? unreadRes.data.unread_total : null,
            needs_login: false,
          };
        } catch {
          // 401 / network — keep stored metadata, no badge.
          return { ...acc, unread: null };
        }
      })
    ).then((list) => {
      if (!cancelled) setAccounts(list);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, stored, activeId]);

  return { accounts, activeId };
}
