import { useState, useEffect, useRef, useCallback } from 'react';
import './index.css';

/*
 * Использование React Hooks (useState, useEffect, useRef) позволяет:
 * - useState: хранить изменяющееся состояние приложения (сообщения, статус подключения и т.д.)
 *   При изменении состояния React сам перерисовывает нужные участки интерфейса.
 * - useEffect: выполнять побочные эффекты (например, подключаться к WebSocket при загрузке)
 * - useRef: хранить ссылки на элементы DOM или переменные, изменения которых не вызывают ререндер.
 */

function App() {
  // Состояния (State)
  const [currentUserId, setCurrentUserId] = useState(null); // Текущий залогиненный пользователь
  const [isConnected, setIsConnected] = useState(false);    // Состояние веб-сокета
  const [messages, setMessages] = useState([]);             // Массив сообщений
  const [inputText, setInputText] = useState('');           // Текущий текст в поле ввода

  // Храним экземпляр соединения WebSocket 
  // Мы используем useRef, чтобы сокет не пересоздавался при каждом обновлении UI.
  const socketRef = useRef(null); 
  // Ссылка на конец списка сообщений для авто-скролла вниз
  const messagesEndRef = useRef(null);

  // -- Логика WebSocket --

  // useEffect - хук жизненного цикла. Выполняется только при изменении currentUserId.
  useEffect(() => {
    // Если пользователь еще не выбрал свой ID (1 или 2), сокет не подключаем
    if (!currentUserId) return;

    // Определяем протокол (ws или wss в зависимости от HTTPS)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Для разработки мы можем подключаться к бэкенду, который запущен на локалхосте (или на порту FastAPI)
    // window.location.host указывает на тот же адрес, откуда был загружен файл (при продакшене совпадает с бэкендом).
    // Если мы в dev режиме Vite (порт 5173), нам придется прописать адрес бэкенда явно или использовать proxy,
    // но в финальной сборке порт будет совпадать.
    const wsUrl = `${protocol}//${window.location.host}/chat/${currentUserId}`;

    // Инициализация соединения
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      // При получении сообщения добавляем его в массив сообщений (setMessages)
      // Мы используем функцию обновления (prev => ...), чтобы получить предыдущее состояние массива
      // и не потерять старые сообщения.
      setMessages((prev) => [...prev, { text: event.data, type: 'incoming', id: Date.now() }]);
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('[WS] Error', error);
    };

    // return функция выполняется при "размонтировании" компонента (Cleanup)
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [currentUserId]); // Зависимость: перезапустить хук если сменится currentUserId


  // -- Отправка сообщений --
  
  // useCallback запоминает функцию, чтобы не пересоздавать ее при каждом ререндере
  const sendMessage = useCallback(() => {
    if (!inputText.trim() || !isConnected) return;
    
    // По логике старого приложения: если ты 1, то шлешь 2 и наоборот.
    const recipientId = currentUserId === 1 ? 2 : 1;
    
    // Формируем payload для бекенда
    const payload = {
      message: inputText.trim(),
      recipient_id: recipientId,
    };

    // Отправляем через вебсокет
    socketRef.current.send(JSON.stringify(payload));
    
    // Сразу добавляем сообщение в UI как отправленное (outgoing)
    setMessages((prev) => [
      ...prev, 
      { text: inputText.trim(), type: 'outgoing', id: Date.now() }
    ]);
    
    // Очищаем поле ввода
    setInputText('');
  }, [inputText, isConnected, currentUserId]);

  // Следим за состоянием `messages` и при его изменении скроллим чат вниз
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  // -- Рендер UI --

  // Если пользователь еще не выбран, показываем окно авторизации ("выбора")
  if (!currentUserId) {
    return (
      <div className="auth-overlay">
        <div className="auth-box">
          <h2>Select Profile</h2>
          <div>
            <button onClick={() => setCurrentUserId(1)}>User 1</button>
            <button onClick={() => setCurrentUserId(2)}>User 2</button>
          </div>
        </div>
      </div>
    );
  }

  // Основной интерфейс (возвращаем так называемый JSX - гибрид HTML и JS)
  // В React вместо class пишется className.
  return (
    <div className="app-container">
      {/* Левая панель - список контактов */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h3>Contacts</h3>
        </div>
        <div className="user-list">
          {/* Показываем контакт собеседника (того, чей ID не наш) */}
          <div className="user-item active">
            User {currentUserId === 1 ? 2 : 1}
          </div>
        </div>
      </aside>

      {/* Основная часть чата */}
      <main className="main-chat">
        {/* Шапка чата: заголовок и статус соединения */}
        <header className="chat-header">
          <h2>💬 SecureChat</h2>
          <div className={`status ${isConnected ? 'online' : 'offline'}`}>
            {isConnected ? 'Online' : 'Offline'}
          </div>
        </header>

        <div className="chat-container">
          {/* Контейнер списка сообщений */}
          <div className="chat-box">
            {messages.map((msg) => (
              <div key={msg.id} className={`message ${msg.type}`}>
                {msg.text}
              </div>
            ))}
            {/* Пустой div в конце списка, куда мы "скроллим" при новых сообщениях */}
            <div ref={messagesEndRef} />
          </div>

          {/* Панель ввода нового сообщения */}
          <div className="input-area">
            <input
              type="text"
              placeholder="Type your message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                // Если нажат Enter, отправляем
                if (e.key === 'Enter') sendMessage();
              }}
              maxLength={500}
            />
            {/* Кнопка заблокирована, если нет текста или нет связи */}
            <button 
              onClick={sendMessage} 
              disabled={!inputText.trim() || !isConnected}
            >
              Send
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
