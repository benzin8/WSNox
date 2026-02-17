const chat = document.getElementById('chatBox');
const button = document.getElementById('sendBtn');
const input = document.getElementById('messageInput');
const statusElem = document.getElementById('connectionStatus');

console.log("JS loaded!");

const currentUserID = Number(prompt("Выберете user_id 1 или 2: "));
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}/chat/${currentUserID}`;

const socketManager = new SocketManager(wsUrl);

socketManager.onStatusChange = (isConnected) => {
    if (isConnected) {
        statusElem.textContent = 'Онлайн';
        statusElem.style.color = "#a0ffa0";
        button.disabled = input.value.trim() === '';
    } else {
        statusElem.textContent = 'Офлайн';
        statusElem.style.color = "#ff8080";
        button.disabled = true;
    }
};

socketManager.onMessageCallBack = (msgText) => {
    addMessageToUI(msgText, 'incoming');
}

socketManager.connect();

input.addEventListener('input', () => {
    const hasText = input.value.trim() !== '';
    const isConnected = socketManager.socket && socketManager.socket.readyState === WebSocket.OPEN;
    button.disabled = !(hasText && isConnected);
});

function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    const recipientId = currentUserID === 1 ? 2 : 1;

    const payload = {
        message: text,
        recipient_id: recipientId,
    }

    const sent = socketManager.sendMessage(JSON.stringify(payload));
    if (sent) {
        addMessageToUI(text, 'outgoing');
        input.value = '';
        button.disabled = true;
        scrollToBottom();
    } else {
        alert('Message not sent, socket closed');
    }
}


function addMessageToUI(text, type) { // type: 'incoming' or 'outgoing'
    const messageElem = document.createElement('div');
    messageElem.textContent = text;
    messageElem.className = `message ${type}`;
    chat.appendChild(messageElem);
    scrollToBottom();
}

function scrollToBottom() {
    chat.scrollTop = chat.scrollHeight;
}

button.addEventListener('click', sendMessage);

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

