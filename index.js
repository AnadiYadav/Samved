/**
 * NRSC Chat Interface
 * Handles chatbot interactions and API integration with streaming support
 */

// API Configuration
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


/** Toggle chat window visibility */
function toggleChat() {

        // Always exit maximized mode when minimizing
    if (chatWindow.classList.contains('maximized')) {
        chatWindow.classList.remove('maximized');
        document.body.style.overflow = '';
        const maximizeBtn = document.querySelector('.maximize-btn');
        if (maximizeBtn) maximizeBtn.textContent = '□';
    }

        isChatOpen = !isChatOpen;
        chatWindow.classList.toggle('active', isChatOpen);
        welcomeBubble.classList.toggle('visible', !isChatOpen);
}

/** Toggle chat window maximization */
function toggleMaximize() {
    const isMaximized = chatWindow.classList.toggle('maximized');
    
    // Update button icon
    const maximizeBtn = document.querySelector('.maximize-btn');
    if (maximizeBtn) 
        {
            maximizeBtn.textContent = isMaximized ? '❐' : '□';
            maximizeBtn.style.background='#FF671F';
        }
    
    
    // When maximizing, also open chat if closed
    if (!isChatOpen && isMaximized) {
        isChatOpen = true;
        chatWindow.classList.add('active');
        welcomeBubble.classList.remove('visible');
    }
    
    // Scroll to bottom when maximizing
    if (isMaximized) {
        const chatBody = document.getElementById('chatBody');
        if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
    }
    
    // Prevent body scrolling when maximized
    document.body.style.overflow = isMaximized ? 'hidden' : '';
}


/** Send message to backend API with CORS workaround */
async function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    if (!message) return;

    // Disable UI during processing
    const sendButton = document.querySelector('.send-btn');
    input.disabled = true;
    sendButton.disabled = true;

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
                ⚠️ Service Error: Our Server is busy.<br>
                <small>Please try after some time.</small>
            </div>
        `;
    } finally {
        // Re-enable UI after processing
        input.disabled = false;
        sendButton.disabled = false;
        input.focus();
    }
    
    chatBody.scrollTop = chatBody.scrollHeight;
}

/**
 * Markdown and HTML formatting helper.
 * Converts Markdown to HTML and then sanitizes it for security.
 */
function formatBotResponse(text) {
    // Step 1: Convert all known Markdown syntax to HTML.
    // The order is important: process block elements (like headings) before inline elements.
    let formattedText = text
        // Headings (e.g., ## Title, ### Subtitle)
        .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
        .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')

        // Markdown links (e.g., [About ISRO](https://...))
        // This will create a standard <a> tag.
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')

        // Bold and Italics (e.g., **bold**, *italic*)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')

        // Newlines (for paragraph breaks)
        .replace(/\n/g, '<br>');

    // Step 2: Sanitize the generated HTML with DOMPurify.
    // This is a critical security step. It ensures that only the safe HTML we
    // created above is rendered, and strips anything potentially malicious.
    const cleanHtml = DOMPurify.sanitize(formattedText, {
        USE_PROFILES: { html: true }, // Allows safe tags like h2, h3, a, strong, br
        ADD_ATTR: ['target'],       // Specifically allows the 'target' attribute for opening links in a new tab
    });

    return cleanHtml;
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
        const sendButton = document.querySelector('.send-btn');
        if (!sendButton.disabled) {
            sendMessage();
        }
    }
}
(function () {
    const hiddenMessage = "Developed by Anadi Yadav Under Scientist B.Purna Kumari!";
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