# Mobile Chat Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Адаптировать чат-интерфейс для мобильных устройств — список чатов и окно чата показываются поочерёдно с плавным слайдом, кнопка "назад" возвращает к списку.

**Architecture:** `mobileView` стейт ('list' | 'chat') в `ChatPage` управляет тем, какая панель видна на мобильном. Обе панели всегда в DOM, переключаются через `translate-x`. На десктопе (≥ md) Tailwind `md:` классы восстанавливают оригинальный side-by-side лэйаут. `ChatWindow` получает `onBack` prop.

**Tech Stack:** React 18 (JSX), Tailwind CSS, lucide-react

---

### Task 1: Добавить кнопку "назад" в ChatWindow

**Files:**
- Modify: `src/messenger/frontend_react/src/components/chat/ChatWindow.jsx`

- [ ] **Step 1: Добавить ChevronLeft в импорт и onBack в props**

Найти и заменить импорт и сигнатуру функции:

```jsx
// БЫЛО:
import React from "react";
import { User, Phone, MoreVertical } from 'lucide-react';

export const ChatWindow = ({
    messages, setMessages, activeChat, sendMessage,
    isConnected, messagesEndRef, inputText, setInputText,
    chatName, onOpenProfile
}) => {

// СТАЛО:
import React from "react";
import { User, Phone, MoreVertical, ChevronLeft } from 'lucide-react';

export const ChatWindow = ({
    messages, setMessages, activeChat, sendMessage,
    isConnected, messagesEndRef, inputText, setInputText,
    chatName, onOpenProfile, onBack
}) => {
```

- [ ] **Step 2: Добавить кнопку "назад" в хедер чата**

Найти в хедере:
```jsx
<div className="flex items-center gap-4">
  <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
    <User size={20} className="text-lime-400" />
  </div>
```

Заменить на:
```jsx
<div className="flex items-center gap-4">
  <button
    onClick={onBack}
    className="md:hidden text-zinc-400 hover:text-lime-400 transition-colors"
  >
    <ChevronLeft size={24} />
  </button>
  <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
    <User size={20} className="text-lime-400" />
  </div>
```

- [ ] **Step 3: Коммит**

```bash
cd /Users/dmitryvislobokov/python/messenger
git add src/messenger/frontend_react/src/components/chat/ChatWindow.jsx
git commit -m "feat: add mobile back button to ChatWindow"
```

---

### Task 2: mobileView стейт и слайд-лэйаут в ChatPage

**Files:**
- Modify: `src/messenger/frontend_react/src/pages/chat/ChatPage.jsx`

- [ ] **Step 1: Добавить mobileView стейт**

После строки:
```jsx
const [showPhoneBanner, setShowPhoneBanner] = useState(false);
```

Добавить:
```jsx
const [mobileView, setMobileView] = useState('list');
```

- [ ] **Step 2: Вызывать setMobileView('chat') при выборе чата**

Найти и заменить функцию `handleSelectChat` целиком:

```jsx
// БЫЛО:
const handleSelectChat = async (selectedChat) => {
    if (selectedChat.recipient) {
      setActiveChat(selectedChat);
      setChatName(selectedChat.recipient.username);
    } else if (selectedChat.id) {
      const chat = await getOrCreateChats(selectedChat.id);
      if (chat) {
        setActiveChat(chat);
        setSearchQuery('');
        const userData = await getUserDataByChatId(chat.id);
        setChatName(userData.username);
        const allChats = await getAllChats();
        setChats(allChats);
      }
    }
  }

// СТАЛО:
const handleSelectChat = async (selectedChat) => {
    if (selectedChat.recipient) {
      setActiveChat(selectedChat);
      setChatName(selectedChat.recipient.username);
      setMobileView('chat');
    } else if (selectedChat.id) {
      const chat = await getOrCreateChats(selectedChat.id);
      if (chat) {
        setActiveChat(chat);
        setSearchQuery('');
        const userData = await getUserDataByChatId(chat.id);
        setChatName(userData.username);
        const allChats = await getAllChats();
        setChats(allChats);
        setMobileView('chat');
      }
    }
  }
```

- [ ] **Step 3: Сменить класс внутреннего контейнера**

Найти:
```jsx
<div className="flex flex-1 overflow-hidden">
```

Заменить на:
```jsx
<div className="relative flex-1 overflow-hidden md:flex">
```

- [ ] **Step 4: Обновить классы сайдбара для слайда**

Найти:
```jsx
<div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-900/50 backdrop-blur-xl">
```

Заменить на:
```jsx
<div className={`absolute inset-y-0 left-0 w-full flex flex-col bg-zinc-900/50 backdrop-blur-xl border-r border-zinc-800 z-10 transition-transform duration-200 ease-in-out md:relative md:inset-auto md:w-80 md:translate-x-0 ${mobileView === 'list' ? 'translate-x-0' : '-translate-x-full'}`}>
```

- [ ] **Step 5: Обернуть ChatWindow в слайд-контейнер и передать onBack**

Найти:
```jsx
<ChatWindow activeChat={activeChat}
 messages={messages}
 setMessages={setMessages}
 sendMessage={handleSendMessage}
 isConnected={isConnected}
 messagesEndRef={messagesEndRef}
 inputText={inputText}
 setInputText={setInputText}
 chatName={chatName}
 onOpenProfile={() => activeChat?.recipient_id && handleOpenUserProfile(activeChat.recipient_id)}
 />
```

Заменить на:
```jsx
<div className={`absolute inset-y-0 left-0 w-full flex flex-col transition-transform duration-200 ease-in-out md:relative md:inset-auto md:flex-1 md:translate-x-0 ${mobileView === 'chat' ? 'translate-x-0' : 'translate-x-full'}`}>
  <ChatWindow activeChat={activeChat}
   messages={messages}
   setMessages={setMessages}
   sendMessage={handleSendMessage}
   isConnected={isConnected}
   messagesEndRef={messagesEndRef}
   inputText={inputText}
   setInputText={setInputText}
   chatName={chatName}
   onOpenProfile={() => activeChat?.recipient_id && handleOpenUserProfile(activeChat.recipient_id)}
   onBack={() => setMobileView('list')}
   />
</div>
```

- [ ] **Step 6: Собрать фронтенд и проверить**

```bash
cd /Users/dmitryvislobokov/python/messenger/src/messenger/frontend_react
npm run build
```

Ожидается: сборка без ошибок.

Ручная проверка в браузере (DevTools → мобильный viewport, например iPhone 375px):
- Видна только панель со списком чатов
- Клик на чат → список уходит влево, появляется окно чата (плавно, ~200мс)
- Клик на кнопку ← в хедере → возврат к списку
- На десктопном viewport → обе панели рядом, кнопка ← скрыта

- [ ] **Step 7: Коммит**

```bash
cd /Users/dmitryvislobokov/python/messenger
git add src/messenger/frontend_react/src/pages/chat/ChatPage.jsx
git commit -m "feat: mobile slide navigation between chat list and chat window"
```
