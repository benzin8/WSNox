import {useState} from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export const useChatAction = () => {
    const [searchResult, setSearchResult] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState(null);

    const searchChats = async (query) => {
        setIsSearching(true);
        setError(null);

        if (query.length < 3) {
            setSearchResult([]);
            return;
        }

        try {
            const token = localStorage.getItem('access_token');
            console.log(token);
            const res = await axios.get(`${API_BASE}/chats/search?query=${query}`,
                {headers: {Authorization: `Bearer ${token}`}}
            )
            console.log("res", res.data);
            setSearchResult(res.data.chats || []);
        } catch (err) {
            setError(err.response?.data?.detail || "Search failed");
        } finally {
            setIsSearching(false);
        }
    }

    return {searchChats, searchResult, isSearching, error};
}