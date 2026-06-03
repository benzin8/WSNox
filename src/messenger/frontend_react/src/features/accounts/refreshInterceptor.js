import axios from 'axios';
import { updateActiveTokens, markActiveNeedsLogin, getActiveId } from './accountStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Shared in-flight refresh so concurrent 401s trigger only one /auth/refresh.
let refreshPromise = null;

function doRefresh() {
  if (refreshPromise) return refreshPromise;
  const userId = getActiveId();
  if (userId == null) return Promise.reject(new Error('no active account'));

  // The refresh token rides as an httpOnly cookie. A legacy refresh_token in
  // localStorage (pre-cookie session) is passed once so the server can set the
  // cookie, then dropped.
  const body = { user_id: userId };
  const legacy = localStorage.getItem('refresh_token');
  if (legacy) body.refresh_token = legacy;

  refreshPromise = axios
    .post(`${API_BASE}/auth/refresh`, body)
    .then((res) => {
      updateActiveTokens(res.data.access_token);
      return res.data.access_token;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

// Register once at app start. On a 401, transparently refresh the active
// account's access token and retry the original request a single time.
export function installRefreshInterceptor() {
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const { response, config } = error;
      if (!response || response.status !== 401 || !config) {
        return Promise.reject(error);
      }
      // Don't loop on the refresh call itself, and only retry once.
      if (config._retried || (config.url || '').includes('/auth/refresh')) {
        markActiveNeedsLogin();
        return Promise.reject(error);
      }
      try {
        const accessToken = await doRefresh();
        config._retried = true;
        config.headers = { ...(config.headers || {}), Authorization: `Bearer ${accessToken}` };
        return axios(config);
      } catch (refreshErr) {
        markActiveNeedsLogin();
        return Promise.reject(refreshErr);
      }
    }
  );
}
