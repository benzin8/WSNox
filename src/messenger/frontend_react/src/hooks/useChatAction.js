import {useState} from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

const getAuthConfig = () => {
    const token = localStorage.getItem('access_token');
    return { headers: { Authorization: `Bearer ${token}` } };
};

export const useChatAction = () => {
    const [searchResult, setSearchResult] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [activeChat, setActiveChat] = useState(null);
    const [error, setError] = useState(null);

    const searchChats = async (query) => {
        setIsSearching(true);
        setError(null);

        if (query.length < 3) {
            setSearchResult([]);
            return;
        }
        try {
            const res = await axios.get(`${API_BASE}/chats/search?query=${query}`, getAuthConfig())
            setSearchResult(res.data.chats || []);
        } catch (err) {
            setError(err.response?.data?.detail || "Search failed");
        } finally {
            setIsSearching(false);
        }
    }

    const getOrCreateChats = async (otherUserID) => {
        try {
            setError(null);
            const res = await axios.post(
                `${API_BASE}/chats/get-or-create`,
                { other_user_id: otherUserID},
                getAuthConfig()
            )
            setActiveChat(res.data);
            return res.data;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to get or create chat");
        }
    }

    const getUserDataByChatId = async (chatId) => {
        try {
            setError(null);
            const res = await axios.get(
                `${API_BASE}/chats/${chatId}/user`,
                getAuthConfig()
            )
            return res.data;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to get user data");
        }
    }

    return {searchChats,
            getUserDataByChatId,
            getOrCreateChats,
            setActiveChat,
            activeChat,
            searchResult,
            isSearching,
            error,
            };
}