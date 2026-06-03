// Multi-account state (C-lite cookie model).
//
// Refresh tokens are NEVER stored client-side — each account has an httpOnly
// cookie `refresh_<user_id>` set by the server. localStorage holds only
// non-sensitive account metadata + which account is active. The active
// account's short-lived (15 min) access token lives in the legacy
// `access_token` key so all existing `Authorization: Bearer` call sites and
// the WebSocket keep working unchanged.

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const ACCOUNTS_KEY = 'accounts';
const ACTIVE_KEY = 'active_account_id';
const ADDING_KEY = 'adding_account';
export const MAX_ACCOUNTS = 5;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function getAccounts() {
  const list = read(ACCOUNTS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export function getActiveId() {
  const raw = localStorage.getItem(ACTIVE_KEY);
  return raw ? Number(raw) : null;
}

function persist(accounts, activeId) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  if (activeId == null) {
    localStorage.removeItem(ACTIVE_KEY);
  } else {
    localStorage.setItem(ACTIVE_KEY, String(activeId));
  }
}

// Strip tokens down to metadata-only (drops legacy access_token/refresh_token
// fields that older sessions stored inside account entries).
function toMeta(user) {
  return {
    user_id: user.id ?? user.user_id,
    display_name: user.display_name || user.name || 'Аккаунт',
    avatar_url: user.avatar_thumb_url ?? user.avatar_url ?? null,
    needs_login: false,
  };
}

// Insert/update an account from an auth response and make it active. The
// server has already set this account's refresh cookie; we keep only the
// access token (active account) + metadata.
export function upsertAccount(user, accessToken) {
  const accounts = getAccounts();
  const entry = toMeta(user);
  const idx = accounts.findIndex((a) => a.user_id === entry.user_id);
  if (idx >= 0) accounts[idx] = { ...accounts[idx], ...entry };
  else accounts.push(entry);
  persist(accounts, entry.user_id);
  localStorage.setItem('access_token', accessToken);
  localStorage.removeItem('refresh_token'); // refresh lives in the cookie now
}

// Ensure the currently logged-in user is represented (metadata only). Migrates
// pre-multi-account / pre-cookie sessions. No network, no reload.
export function seedCurrentAccount({ user_id, display_name, avatar_url }) {
  const access = localStorage.getItem('access_token');
  if (!access || user_id == null) return;
  const accounts = getAccounts();
  const idx = accounts.findIndex((a) => a.user_id === user_id);
  if (idx >= 0 && getActiveId() === user_id) return;
  const entry = {
    user_id,
    display_name: display_name || 'Аккаунт',
    avatar_url: avatar_url || null,
    needs_login: false,
  };
  if (idx >= 0) accounts[idx] = { ...accounts[idx], ...entry };
  else accounts.push(entry);
  persist(accounts, user_id);
}

// App-start hook. Kept for compatibility; the active account's access token is
// already in the legacy key, so there's nothing to mirror.
export function syncActiveFromStore() {
  const accounts = getAccounts();
  if (getActiveId() == null && accounts.length > 0) {
    persist(accounts, accounts[0].user_id);
  }
}

// Mint a fresh access token for an account from its httpOnly refresh cookie.
// For sessions created before the cookie model, falls back to the legacy
// refresh token still kept in the account entry (or the top-level key for the
// active account) so the server can validate it and set the cookie (migration).
export async function mintAccess(userId) {
  const body = { user_id: userId };
  const acc = getAccounts().find((a) => a.user_id === userId);
  const legacy =
    (acc && acc.refresh_token) ||
    (userId === getActiveId() ? localStorage.getItem('refresh_token') : null);
  if (legacy) body.refresh_token = legacy;
  const res = await axios.post(`${API_BASE}/auth/refresh`, body);
  return res.data.access_token;
}

// Drop the legacy refresh token from an account entry once it's migrated to a
// cookie (so we stop sending it).
function stripLegacyRefresh(userId) {
  const accounts = getAccounts();
  const idx = accounts.findIndex((a) => a.user_id === userId);
  const acc = accounts[idx];
  if (acc && (acc.refresh_token || acc.access_token)) {
    accounts[idx] = {
      user_id: acc.user_id,
      display_name: acc.display_name,
      avatar_url: acc.avatar_url,
      needs_login: acc.needs_login,
    };
    persist(accounts, getActiveId());
  }
}

// Update the active account's access token after a refresh.
export function updateActiveTokens(accessToken) {
  localStorage.setItem('access_token', accessToken);
  localStorage.removeItem('refresh_token');
  const accounts = getAccounts();
  const idx = accounts.findIndex((a) => a.user_id === getActiveId());
  if (idx >= 0 && accounts[idx].needs_login) {
    accounts[idx] = { ...accounts[idx], needs_login: false };
    persist(accounts, getActiveId());
  }
}

export function markActiveNeedsLogin() {
  const accounts = getAccounts();
  const activeId = getActiveId();
  const idx = accounts.findIndex((a) => a.user_id === activeId);
  if (idx >= 0) {
    accounts[idx] = { ...accounts[idx], needs_login: true };
    persist(accounts, activeId);
  }
  localStorage.removeItem('access_token');
}

// Switch active account: mint a fresh access token from the target account's
// refresh cookie (sent automatically), then reload to re-init WS/contexts.
export async function switchAccount(userId) {
  try {
    const accessToken = await mintAccess(userId);
    persist(getAccounts(), userId);
    localStorage.setItem('access_token', accessToken);
    localStorage.removeItem('refresh_token');
    stripLegacyRefresh(userId);
    window.location.reload();
  } catch {
    const accounts = getAccounts();
    const idx = accounts.findIndex((a) => a.user_id === userId);
    if (idx >= 0) {
      accounts[idx] = { ...accounts[idx], needs_login: true };
      persist(accounts, getActiveId());
    }
  }
}

// Remove an account: clear its server cookie, drop its metadata. If it was the
// active one, switch to the next remaining account, else go to login.
export async function removeAccount(userId, navigate) {
  try {
    await axios.post(`${API_BASE}/auth/logout`, { user_id: userId });
  } catch {
    /* best-effort cookie clear */
  }
  const accounts = getAccounts().filter((a) => a.user_id !== userId);
  const wasActive = getActiveId() === userId;
  if (!wasActive) {
    persist(accounts, getActiveId());
    return;
  }
  if (accounts.length > 0) {
    persist(accounts, accounts[0].user_id);
    await switchAccount(accounts[0].user_id); // mints access + reloads
  } else {
    persist(accounts, null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    if (navigate) navigate('/auth/send-code');
    else window.location.assign('/auth/send-code');
  }
}

export function beginAddAccount() {
  localStorage.setItem(ADDING_KEY, '1');
}

export function isAddingAccount() {
  return localStorage.getItem(ADDING_KEY) === '1';
}

export function endAddAccount() {
  localStorage.removeItem(ADDING_KEY);
}
