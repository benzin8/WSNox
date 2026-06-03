import axios from 'axios';
import { updateActiveTokens, markActiveNeedsLogin } from './accountStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Shared in-flight refresh so concurrent 401s trigger only one /auth/refresh.
let refreshPromise = null;

function doRefresh() {
  if (refreshPromise) return refreshPromise;
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return Promise.reject(new Error('no refresh token'));

  refreshPromise = axios
    .post(`${API_BASE}/auth/refresh`, { refresh_token: refreshToken })
    .then((res) => {
      const { access_token, refresh_token } = res.data;
      updateActiveTokens(access_token, refresh_token);
      return access_token;
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
