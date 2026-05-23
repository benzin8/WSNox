import React from "react";
import { useState } from "react";
import { Send } from "lucide-react";

export const InputArea = ({sendMessage, isConnected}) => {
    const [inputText, setInputText] = useState("")

    const handleSubmit = (e) => {
      e.preventDefault()
      if (inputText.trim() && isConnected) {
        sendMessage(inputText)
        setInputText("")
      }
    }
    return (
        <div className="p-6 bg-zinc-900/50 border-t border-zinc-800">
          <form 
            onSubmit={handleSubmit}
            className="flex items-center gap-3 bg-zinc-800 rounded-2xl p-2 pl-4 border border-zinc-700 focus-within:border-lime-400/50 focus-within:ring-4 focus-within:ring-lime-500/10 transition-all"
          >
            <input
              type="text"
              placeholder="Type your message..."
              className="flex-grow bg-transparent border-none focus:outline-none text-base md:text-sm py-2"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button 
              type="submit"
              disabled={!inputText.trim() || !isConnected}
              className="p-3 bg-lime-400 text-zinc-900 rounded-xl hover:bg-lime-300 transition-all disabled:grayscale disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
    )
}