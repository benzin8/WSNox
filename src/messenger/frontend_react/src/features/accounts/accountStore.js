// Single source of truth for multi-account state in localStorage.
// Legacy keys `access_token`/`refresh_token` are always mirrored to the
// active account so existing code that reads them directly keeps working.

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

function mirrorLegacyKeys(account) {
  if (account) {
    localStorage.setItem('access_token', account.access_token);
    localStorage.setItem('refresh_token', account.refresh_token);
  } else {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }
}

function persist(accounts, activeId) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  if (activeId == null) {
    localStorage.removeItem(ACTIVE_KEY);
  } else {
    localStorage.setItem(ACTIVE_KEY, String(activeId));
  }
}

// Insert/update an account from an auth response and make it active.
// `user` is the UserResponse object; tokens are the JWT pair.
export function upsertAccount(user, accessToken, refreshToken) {
  const accounts = getAccounts();
  const entry = {
    user_id: user.id,
    display_name: user.display_name || user.name,
    avatar_url: user.avatar_thumb_url || null,
    access_token: accessToken,
    refresh_token: refreshToken,
    needs_login: false,
  };
  const idx = accounts.findIndex((a) => a.user_id === user.id);
  if (idx >= 0) accounts[idx] = entry;
  else accounts.push(entry);
  persist(accounts, user.id);
  mirrorLegacyKeys(entry);
}

// Bootstrap: keep the active account's legacy keys in sync. Called once at
// app start. If accounts is empty but legacy tokens exist (pre-multi-account
// session), seedCurrentAccount (called once user info is available) migrates it.
export function syncActiveFromStore() {
  const accounts = getAccounts();
  const activeId = getActiveId();
  const active = accounts.find((a) => a.user_id === activeId);
  if (active) mirrorLegacyKeys(active);
}

// Ensure the current (legacy) session is represented in the accounts list.
// Migrates pre-multi-account sessions: if the logged-in user isn't stored
// yet, add them using the live legacy tokens and mark them active. Does NOT
// reload. No-op once the active account is already represented.
export function seedCurrentAccount({ user_id, display_name, avatar_url }) {
  const access = localStorage.getItem('access_token');
  const refresh = localStorage.getItem('refresh_token');
  if (!access || !refresh || user_id == null) return;
  const accounts = getAccounts();
  const idx = accounts.findIndex((a) => a.user_id === user_id);
  if (idx >= 0 && getActiveId() === user_id) return; // already represented & active
  const entry = {
    user_id,
    display_name: display_name || 'Аккаунт',
    avatar_url: avatar_url || null,
    access_token: access,
    refresh_token: refresh,
    needs_login: false,
  };
  if (idx >= 0) accounts[idx] = entry;
  else accounts.push(entry);
  persist(accounts, user_id);
}

export function switchAccount(userId) {
  const accounts = getAccounts();
  const target = accounts.find((a) => a.user_id === userId);
  if (!target) return;
  persist(accounts, userId);
  mirrorLegacyKeys(target);
  window.location.reload();
}

// Remove an account. If it was active, switch to the first remaining one
// (reload), or return to login when none remain.
export function removeAccount(userId, navigate) {
  const accounts = getAccounts().filter((a) => a.user_id !== userId);
  const wasActive = getActiveId() === userId;
  if (!wasActive) {
    persist(accounts, getActiveId());
    return;
  }
  if (accounts.length > 0) {
    persist(accounts, accounts[0].user_id);
    mirrorLegacyKeys(accounts[0]);
    window.location.reload();
  } else {
    persist(accounts, null);
    mirrorLegacyKeys(null);
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
