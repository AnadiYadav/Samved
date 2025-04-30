/**
 * NRSC Chat Interface
 * Handles chatbot interactions and API integration
 */

// API Configuration
const API_BASE_URL = 'http://localhost:3000';
let sessionId = localStorage.getItem('sessionId') || generateSessionId();
localStorage.setItem('sessionId', sessionId);

// Chat elements
const chatWindow = document.querySelector('.chat-window');
const chatIcon = document.querySelector('.chat-icon');
const welcomeBubble = document.querySelector('.welcome-bubble');
let isChatOpen = false;

// Generate unique session ID for anonymous users
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Temporarily open Admin Login Page (double click header)
const clickHead = document.getElementById('click-head');
clickHead.addEventListener('dblclick', () => {
    window.location.href = '/frontend/templates/admin-login.html';
});

/** Toggle chat window visibility */
function toggleChat() {
    isChatOpen = !isChatOpen;
    chatWindow.classList.toggle('active', isChatOpen);
    welcomeBubble.classList.toggle('visible', !isChatOpen);
}

/** Send message to backend API */
async function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    if (!message) return;

    const chatBody = document.getElementById('chatBody');
    
    // Add user message
    chatBody.innerHTML += `
        <div class="message user-message">${escapeHtml(message)}</div>
    `;
    input.value = '';
    
    try {
        // Show loading indicator
        const loadingMsg = addLoadingMessage();

        // Call backend API
        // const response = await fetch(`${API_BASE_URL}/ask`, {           //For Local System Api
        const response = await fetch(`https://8888-01js1h540pyys2dz7kcae1fbk9.cloudspaces.litng.ai/ask`, {  
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest' // Basic security header
            },
            body: JSON.stringify({
                query: message,
                session_id: sessionId
            })
        });

        // Remove loading indicator
        chatBody.removeChild(loadingMsg);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        chatBody.innerHTML += `
            <div class="message bot-message">${escapeHtml(data.answer)}</div>
        `;
        
    } catch (error) {
        console.error('Chat error:', error);
        chatBody.innerHTML += `
            <div class="message bot-message">⚠️ Secure Connection Alert: Please try again later. If the problem persists, contact NRSC support.</div>
        `;
    }
    
    // Scroll to bottom
    chatBody.scrollTop = chatBody.scrollHeight;
}

/** Add loading indicator */
function addLoadingMessage() {
    const chatBody = document.getElementById('chatBody');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message bot-message';
    loadingDiv.innerHTML = `
        <div class="loading-dots">
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        </div>
    `;
    chatBody.appendChild(loadingDiv);
    return loadingDiv;
}

/** XSS Protection */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Enter key handler
function handleEnter(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Initialize chat
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        welcomeBubble.classList.add('visible');
    }, 5000);
});

// Add loading animation styles
const style = document.createElement('style');
style.textContent = `
.loading-dots {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--isro-blue);
    animation: dotPulse 1.4s infinite ease-in-out;
}

.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes dotPulse {
    0%, 80%, 100% { transform: scale(0.5); }
    40% { transform: scale(1); }
}
`;
document.head.appendChild(style);