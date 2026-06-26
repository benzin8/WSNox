// Biometric / passkey login via WebAuthn (paired with the backend's py_webauthn).
import axios from 'axios';
import {
    browserSupportsWebAuthn,
    startAuthentication,
    startRegistration,
} from '@simplewebauthn/browser';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function biometricSupported() {
    try {
        return browserSupportsWebAuthn();
    } catch {
        return false;
    }
}

function authCfg() {
    const token = localStorage.getItem('access_token');
    return { headers: token ? { Authorization: `Bearer ${token}` } : {} };
}

// Register a passkey on this device (enable biometrics). Needs to be signed in.
export async function enableBiometric() {
    const { data: optionsJSON } = await axios.post(
        `${API_BASE}/auth/webauthn/register/options`, {}, authCfg(),
    );
    const attResp = await startRegistration({ optionsJSON });
    await axios.post(`${API_BASE}/auth/webauthn/register/verify`, attResp, authCfg());
}

export async function disableBiometric() {
    await axios.delete(`${API_BASE}/auth/webauthn/credentials`, authCfg());
}

export async function getBiometricStatus() {
    const { data } = await axios.get(`${API_BASE}/auth/webauthn/status`, authCfg());
    return data; // { enabled, count }
}

// Usernameless biometric login. Returns the auth response { user, access_token }.
export async function loginWithBiometric() {
    const { data: optionsJSON } = await axios.post(`${API_BASE}/auth/webauthn/login/options`, {});
    const asseResp = await startAuthentication({ optionsJSON });
    const { data } = await axios.post(`${API_BASE}/auth/webauthn/login/verify`, asseResp);
    return data;
}
