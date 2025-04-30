document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    
    // Get data from URL parameters
    const sessionId = params.get('sessionId') || 'N/A';
    const question = decodeURIComponent(params.get('question') || '');
    
    // Set form values
    document.getElementById('sessionId').value = sessionId;
    document.getElementById('question').value = question;

    // Form submission handler
    document.getElementById('queryForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const finalQuestion = document.getElementById('question').value.trim();
        
        if (!validateEmail(email)) {
            showStatus('Please enter a valid email address', 'error');
            return;
        }

        // Construct mailto link
        const subject = encodeURIComponent('Personal query posted through Samved');
        const body = encodeURIComponent(
`Query Details:

Email: ${email}
Session ID: ${sessionId}
Question: ${finalQuestion}

---\nThis query was generated via NRSC Chatbot`
        );

        // Open user's email client
        window.location.href = `mailto:data@nrsc.gov.in?subject=${subject}&body=${body}`;
        
        // Show confirmation message
        showStatus('Email client opened. Please send the pre-filled email to complete submission.', 'success');
    });
});

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}