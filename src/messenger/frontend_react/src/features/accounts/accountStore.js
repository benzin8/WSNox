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
// session), there's nothing to seed (we lack user info) — leave as-is.
export function syncActiveFromStore() {
  const accounts = getAccounts();
  const activeId = getActiveId();
  const active = accounts.find((a) => a.user_id === activeId);
  if (active) mirrorLegacyKeys(active);
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
