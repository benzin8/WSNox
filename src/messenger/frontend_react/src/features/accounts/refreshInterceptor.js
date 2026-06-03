import axios from 'axios';
import { updateActiveTokens, markActiveNeedsLogin, getActiveId, mintAccess } from './accountStore';

// Shared in-flight refresh so concurrent 401s trigger only one /auth/refresh.
let refreshPromise = null;

function doRefresh() {
  if (refreshPromise) return refreshPromise;
  const userId = getActiveId();
  if (userId == null) return Promise.reject(new Error('no active account'));

  refreshPromise = mintAccess(userId)
    .then((accessToken) => {
      updateActiveTokens(accessToken);
      return accessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export function installRefreshInterceptor() {
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const { response, config } = error;
      if (!response || response.status !== 401 || !config) {
        return Promise.reject(error);
      }
      // Auth endpoints (/auth/refresh, /auth/logout, ...) manage their own
      // errors — never auto-refresh or clear the session from them. This is
      // critical: background per-account refreshes (unread badges) and account
      // switches must NOT be able to log the active account out.
      if ((config.url || '').includes('/auth/')) {
        return Promise.reject(error);
      }
      if (config._retried) {
        return Promise.reject(error);
      }
      try {
        const accessToken = await doRefresh();
        config._retried = true;
        config.headers = { ...(config.headers || {}), Authorization: `Bearer ${accessToken}` };
        return axios(config);
      } catch (refreshErr) {
        // The active account's own refresh failed for a normal request →
        // the session is genuinely dead.
        markActiveNeedsLogin();
        return Promise.reject(refreshErr);
      }
    }
  );
}
