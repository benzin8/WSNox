import {useState} from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const getAuthConfig = () => {
    const token = localStorage.getItem('access_token');
    return { headers: { Authorization: `Bearer ${token}` } };
};

export const useChatAction = () => {
    const [searchResult, setSearchResult] = useState([]);
    const [searchChannelResult, setSearchChannelResult] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [activeChat, setActiveChat] = useState(null);
    const [error, setError] = useState(null);

    const searchChats = async (query) => {
        setIsSearching(true);
        setError(null);

        if (query.length < 3) {
            setSearchResult([]);
            setSearchChannelResult([]);
            return;
        }
        try {
            const res = await axios.get(
                `${API_BASE}/chats/search?query=${query}`,
                getAuthConfig()
            )
            setSearchResult(res.data.chats || []);
            setSearchChannelResult(res.data.channels || []);
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

    const getMyData = async () => {
        try {
            setError(null);
            const res = await axios.get(
                `${API_BASE}/chats/me`,
                getAuthConfig()
            )
            return res.data;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to get user data");
        }
    }

    const getMessagesByChatId = async (chatId) => {
        try {
            setError(null);
            const res = await axios.get(
                `${API_BASE}/chats/${chatId}/messages`,
                getAuthConfig()
            )
            return res.data;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to get messages");
        }
    }

    const getAllChats = async () => {
        try {
            setError(null);
            const res = await axios.get(
                `${API_BASE}/chats/`,
                getAuthConfig()
            )
            return res.data;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to get chats");
            return [];
        }
    }

    const markChatAsRead = async (chatId) => {
        try {
            await axios.post(
                `${API_BASE}/chats/${chatId}/read`,
                null,
                getAuthConfig()
            );
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to mark chat as read");
        }
    }

    const createGroupChat = async (name, memberIds) => {
        try {
            setError(null);
            const res = await axios.post(
                `${API_BASE}/chats/group`,
                { name, member_ids: memberIds },
                getAuthConfig()
            );
            return res.data;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to create group");
            return null;
        }
    }

    const getChatMembers = async (chatId) => {
        try {
            setError(null);
            const res = await axios.get(
                `${API_BASE}/chats/${chatId}/members`,
                getAuthConfig()
            );
            return res.data;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to fetch members");
            return null;
        }
    }

    const addGroupMembers = async (chatId, memberIds) => {
        try {
            setError(null);
            const res = await axios.post(
                `${API_BASE}/chats/${chatId}/members`,
                { member_ids: memberIds },
                getAuthConfig()
            );
            return res.data;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to add members");
            return null;
        }
    }

    const leaveGroupChat = async (chatId) => {
        try {
            await axios.post(`${API_BASE}/chats/${chatId}/leave`, null, getAuthConfig());
            return true;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to leave group");
            return false;
        }
    }

    const deleteChat = async (chatId) => {
        try {
            await axios.delete(`${API_BASE}/chats/${chatId}`, getAuthConfig());
            return true;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to delete chat");
            return false;
        }
    }

    const createChannel = async (name, description) => {
        try {
            setError(null);
            const res = await axios.post(
                `${API_BASE}/chats/channels`,
                { name, description: description || null },
                getAuthConfig()
            );
            return res.data;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to create channel");
            return null;
        }
    }

    const subscribeChannel = async (chatId) => {
        try {
            setError(null);
            const res = await axios.post(
                `${API_BASE}/chats/channels/${chatId}/subscribe`,
                null,
                getAuthConfig()
            );
            return res.data;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to subscribe");
            return null;
        }
    }

    const joinChannelByToken = async (token) => {
        try {
            setError(null);
            const res = await axios.post(
                `${API_BASE}/chats/channels/join/${token}`,
                null,
                getAuthConfig()
            );
            return res.data;
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to join channel");
            return null;
        }
    }

    return {searchChats,
            createChannel,
            subscribeChannel,
            joinChannelByToken,
            searchChannelResult,
            getUserDataByChatId,
            getOrCreateChats,
            getMyData,
            getMessagesByChatId,
            getAllChats,
            markChatAsRead,
            createGroupChat,
            getChatMembers,
            addGroupMembers,
            leaveGroupChat,
            deleteChat,
            setActiveChat,
            activeChat,
            searchResult,
            isSearching,
            error,
            };
}