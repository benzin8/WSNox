import { useState } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const getAuthConfig = () => ({
    headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` },
});

export const useProfile = () => {
    const [isLoading, setIsLoading] = useState(false);

    // Fetch the current user's own profile
    const fetchMyProfile = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/profiles/me`, getAuthConfig());
            return res.data;
        } catch (err) {
            console.error("Failed to fetch own profile", err);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch any user's profile by their ID
    const fetchUserProfile = async (userId) => {
        setIsLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/profiles/${userId}`, getAuthConfig());
            return res.data;
        } catch (err) {
            console.error("Failed to fetch user profile", err);
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    // Update own profile fields
    const updateMyProfile = async (data) => {
        try {
            const res = await axios.put(`${API_BASE}/profiles/me`, data, getAuthConfig());
            return res.data;
        } catch (err) {
            console.error("Failed to update profile", err);
            return null;
        }
    };

    const sendPhoneCode = async (phoneNumber) => {
        try {
            await axios.post(`${API_BASE}/profiles/phone/send-code`, { phone_number: phoneNumber }, getAuthConfig());
            return true;
        } catch (err) {
            throw err.response?.data?.detail || 'Failed to send code';
        }
    };

    const verifyPhoneCode = async (phoneNumber, code) => {
        try {
            const res = await axios.post(`${API_BASE}/profiles/phone/verify`, { phone_number: phoneNumber, code }, getAuthConfig());
            return res.data;
        } catch (err) {
            throw err.response?.data?.detail || 'Invalid code';
        }
    };

    return { isLoading, fetchMyProfile, fetchUserProfile, updateMyProfile, sendPhoneCode, verifyPhoneCode };
};
