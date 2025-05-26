/**
 * NRSC Chat Interface
 * Handles chatbot interactions and API integration with streaming support
 */

// API Configuration
const API_BASE_URL = 'https://8888-01js1h540pyys2dz7kcae1fbk9.cloudspaces.litng.ai';
let sessionId = null;
// localStorage.setItem('sessionId', sessionId);

// Chat elements
const chatWindow = document.querySelector('.chat-window');
const chatIcon = document.querySelector('.chat-icon');
const welcomeBubble = document.querySelector('.welcome-bubble');
let isChatOpen = false;

// Generate unique session ID for anonymous users
function generateSessionId() {
    const crypto = window.crypto || window.msCrypto;
    const buffer = new Uint8Array(16);
    
    if (crypto && crypto.getRandomValues) {
      crypto.getRandomValues(buffer);
    } else {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
      }
    }
    
    const newId = 'session_' + Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    console.log('New session ID generated:', newId);
    return newId;
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


/** Send message to backend API with CORS workaround */
async function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    if (!message) return;


    if (!sessionId) {
        sessionId = generateSessionId();
        try {
            await fetch(`http://localhost:3000/api/session-start`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    session_id: sessionId,
                    timestamp: new Date().toISOString()
                })
            });
        } catch (error) {
            console.log('Session tracking error:', error);
        }
    }

    const chatBody = document.getElementById('chatBody');
    
    // Add user message
    chatBody.innerHTML += `
        <div class="message user-message">${escapeHtml(message)}</div>
    `;
    input.value = '';
    
    try {
        // Show loading indicator
        const loadingMsg = addLoadingMessage();

        // CORS proxy configuration
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const targetUrl = encodeURIComponent('https://7860-01jsbrn78sydwxvkhr021tsz56.cloudspaces.litng.ai/ask');
        const apiUrl = 'http://localhost:3001/proxy/ask';
        const requestData = {
            query: message,
            session_id: sessionId
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Origin': 'http://localhost:5500'  // Match your development origin
            },
            body: JSON.stringify(requestData)
        });

        // Remove loading indicator
        chatBody.removeChild(loadingMsg);

        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            const errorMsg = errorData?.message || `HTTP error! Status: ${response.status}`;
            throw new Error(errorMsg);
        }

        const responseData = await response.json();
        let botResponse = responseData.response || 
                responseData.answer || 
                responseData.message || 
                "Received an unexpected response format";
        
        // Format the response with markdown support
        const formattedResponse = formatBotResponse(botResponse);
            chatBody.innerHTML += `
                <div class="message bot-message">
                    ${formattedResponse}
                    <div class="personal-query-link">
                        Need personalized assistance? 
                        <a href="/frontend/templates/personal-query.html?sessionId=${encodeURIComponent(sessionId)}&question=${encodeURIComponent(message)}" 
                        target="_blank">Click here to submit your query.</a>
                    </div>
                </div>
            `;
        
    } catch (error) {
        console.error('Chat error:', error);
        
        // Remove loading indicator
        const loadingMsg = document.querySelector('.loading-dots');
        if (loadingMsg?.parentNode) loadingMsg.parentNode.remove();
        
        chatBody.innerHTML += `
            <div class="message bot-message error-message">
                ⚠️ Service Error: ${escapeHtml(error.message)}<br>
                <small>Try refreshing or contact support</small>
            </div>
        `;
    }
    
    chatBody.scrollTop = chatBody.scrollHeight;
}

/** Markdown formatting helper */
function formatBotResponse(text) {
    // Convert markdown to HTML
    let formattedText = escapeHtml(text)
        // Headings
        .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
        .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italics
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        // Line breaks
        .replace(/\n/g, '<br>');

    return formattedText;
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
(function () {
    const hiddenMessage = "Developed by Anadi Yadav!";
    setTimeout(() => {
      console.log(`%c${hiddenMessage}`, "color: transparent");
    }, 60000); 

    window.showCreator = function () {
      console.log(`%c${hiddenMessage}`, "color: limegreen; font-weight: bold;");
    };
  })();
  
// Initialize chat
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        welcomeBubble.classList.add('visible');
    }, 5000);
});

// Add loading animation styles and markdown formatting
const style = document.createElement('style');
style.textContent = `
/* Loading animation */
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

/* Markdown formatting */
.bot-message h2 {
    font-size: 1.2em;
    margin: 10px 0;
    color: var(--isro-blue);
    border-bottom: 1px solid #ddd;
    padding-bottom: 5px;
}

.bot-message h3 {
    font-size: 1.1em;
    margin: 8px 0;
    color: var(--isro-dark-blue);
}

.bot-message strong {
    font-weight: 600;
    color: var(--isro-dark-blue);
}

.bot-message em {
    font-style: italic;
}

.bot-message a {
    color: var(--isro-blue);
    text-decoration: underline;
}

.bot-message br {
    display: block;
    content: '';
    margin-bottom: 8px;
}

.bot-message p {
    margin: 6px 0;
}

/* Personal query link styling */
.personal-query-link {
    margin-top: 15px;
    padding-top: 10px;
    border-top: 1px solid rgba(0,102,178,0.2);
    font-size: 0.9em;
}

.personal-query-link a {
    color: var(--isro-orange) !important;
    text-decoration: none;
    font-weight: 500;
    transition: opacity 0.3s ease;
}

.personal-query-link a:hover {
    opacity: 0.8;
    text-decoration: underline;
}
`;
document.head.appendChild(style);