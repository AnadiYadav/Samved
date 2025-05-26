/**
 * NRSC Admin Dashboard Controller
 * Handles dashboard visualization and knowledge submission
 */

// Configuration
const API_BASE_URL = 'http://localhost:3000/api';


// Initialize Dashboard with Authentication Check
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Verify authentication status
        const authCheck = await fetch(`${API_BASE_URL}/admin-data`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const authData = await authCheck.json();
        
        if (!authCheck.ok || authData.user.role !== 'admin') {
            document.cookie = 'authToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            window.location.href = '/frontend/templates/admin-login.html';
            return;
        }

        // Initialize dashboard components
        loadDebugPDFList();
        initializeCharts();
        loadActiveSessions();
        loadPendingRequests();
        loadTotalQueries();
        setInterval(() => {
            loadActiveSessions();
            loadTotalQueries(); // Refresh daily count periodically
        }, 30000);
        
        // Form submission handler
        document.getElementById('knowledgeForm').addEventListener('submit', handleKnowledgeSubmission);
        document.querySelector('.btn-logout').addEventListener('click', handleLogout);

    } catch (error) {
        console.error('Authentication check failed:', error);
        document.cookie = 'authToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        window.location.href = '/frontend/templates/admin-login.html';
    }
});


// Chart Initialization
async function initializeCharts() {
    
    // Frequently Asked Questions Chart
    const faqCtx = document.getElementById('faqChart').getContext('2d');
    new Chart(faqCtx, {
        type: 'bar',
        data: {
            labels: ['Satellite Data', 'GIS Mapping', 'Weather', 'Sensors', 'Other'],
            datasets: [{
                label: 'Questions Count',
                data: [65, 59, 80, 81, 56],
                backgroundColor: 'rgba(0, 102, 178, 0.8)',
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });

    // Visitor Statistics Chart
    const visitorCtx = document.getElementById('visitorChart').getContext('2d');
    
    try {
        const response = await fetch(`${API_BASE_URL}/visitor-stats`, {
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { data } = await response.json();

        new Chart(visitorCtx, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Daily Visitors',
                    data: data.data,
                    borderColor: '#0066b2',
                    tension: 0.4,
                    fill: false,
                    pointRadius: 4,
                    pointBackgroundColor: '#0066b2'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            title: (context) => `Date: ${context[0].label}`,
                            label: (context) => `Visitors: ${context.raw}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Visitors' }
                    }
                }
            }
        });

    } catch (error) {
        console.error('Visitor chart error:', error);
        // Fallback to empty chart
        new Chart(visitorCtx, {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }


    // ==================== SENTIMENT CHART INITIALIZATION ====================
    initializeSentimentChart();
    
let adminSentimentChart = null;

async function initializeSentimentChart() {
    try {
        const response = await fetch(`${API_BASE_URL}/admin/sentiment`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const { data } = await response.json();

        if (adminSentimentChart) adminSentimentChart.destroy();

        const ctx = document.getElementById('sentimentChart').getContext('2d');
        adminSentimentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Sentiment Score',
                    data: data.scores,
                    backgroundColor: data.scores.map(score => {
                        if (score >= 0.7) return '#03A31C';
                        if (score >= 0.4) return '#FFC107';
                        return '#F44336';
                    }),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { 
                        beginAtZero: true,
                        max: 1.0,
                        title: { text: 'Sentiment Score' }
                    },
                    x: {
                        title: { text: 'Recent Queries' }
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error:', error);
        showErrorToast('Failed to load data');
        initializeFallbackChart();
    }
}

function initializeFallbackChart() {
    const ctx = document.getElementById('sentimentChart').getContext('2d');
    if (adminSentimentChart) adminSentimentChart.destroy();
    adminSentimentChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}


     // Fetch real approval stats from API
     const statsResponse = await fetch(`${API_BASE_URL}/my-approval-stats`, {
        credentials: 'include'
    });
    const statsData = await statsResponse.json();
    
    // Approval Status Chart
    const approvalCtx = document.getElementById('approvalChart').getContext('2d');
    new Chart(approvalCtx, {
        type: 'pie',
        data: {
            labels: ['Approved', 'Pending', 'Rejected'],
            datasets: [{
                data: [
                    statsData.data.approved || 0,
                    statsData.data.pending || 0,
                    statsData.data.rejected || 0
                ],
                backgroundColor: ['#03A31C', '#FFC107', '#F44336']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.raw} requests`;
                        }
                    }
                }
            }
        }
    });
}
// Load Active Sessions
async function loadActiveSessions() {
    try {
        const response = await fetch(`${API_BASE_URL}/my-active-sessions`, {
            credentials: 'include'
        });
        const data = await response.json();
        document.getElementById('activeSessions').textContent = data.count;
    } catch (error) {
        console.error('Active sessions error:', error);
    }
}

// Load Pending Requests
async function loadPendingRequests() {
    try {
        const response = await fetch(`${API_BASE_URL}/my-pending-requests`, {
            credentials: 'include'
        });
        const data = await response.json();
        document.getElementById('pendingRequests').textContent = data.count;
    } catch (error) {
        console.error('Pending requests error:', error);
    }
}

// Handle Knowledge Submission
async function handleKnowledgeSubmission(e) {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('title', document.getElementById('knowledgeTitle').value);
    formData.append('type', document.getElementById('knowledgeType').value);
    formData.append('description', document.getElementById('knowledgeDesc').value);

    if (document.getElementById('knowledgeType').value === 'pdf') {
        formData.append('file', document.getElementById('knowledgePDF').files[0]);
    } else {
        formData.append('content', document.getElementById('knowledgeContent').value);
    }

    try {
        const response = await fetch(`${API_BASE_URL}/knowledge-requests`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Submission failed');
        }

        alert('NRSC: Knowledge submitted for approval');
        document.getElementById('knowledgeForm').reset();
        loadPendingRequests();
    } catch (error) {
        console.error('Submission Error:', error);
        alert(`NRSC Error: ${error.message}`);
    }
}

// =============== REQUEST HISTORY HANDLERS ===============
let currentExpandedId = null;

async function showRequestHistory() {
    try {
        document.getElementById('requestHistoryModal').style.display = 'block';
        const response = await fetch(`${API_BASE_URL}/my-request-history`, {
            credentials: 'include'
        });
        const { requests } = await response.json();
        populateHistoryTable(requests);
    } catch (error) {
        console.error('Request history error:', error);
        alert('Failed to load request history');
    }
}


// ==================== AUTH TOKEN HANDLER ====================
function getAuthToken() {
    const cookie = document.cookie.split('; ')
    .find(row => row.startsWith('authToken='));
    return cookie ? cookie.split('=')[1] : null;
}

// ==================== ADMIN Total QUERIES ====================
// ==================== COMPLETE DAILY QUERIES HANDLER ====================
async function loadTotalQueries() {
    const dailyElement = document.getElementById('dailyQueries');
    
    try {
        // 1. Make request
        const response = await fetch(`${API_BASE_URL}/admin/total-queries`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });

        // 2. Handle HTTP errors
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server responded with ${response.status}: ${errorText}`);
        }

        // 3. Parse JSON
        const data = await response.json();

        // 4. Validate response structure
        if (typeof data.success === 'undefined' || typeof data.count === 'undefined') {
            throw new Error('Invalid response format from server');
        }

        // 5. Handle business logic errors
        if (!data.success) {
            throw new Error(data.message || 'Failed to load query count');
        }

        // 6. Update UI
        dailyElement.textContent = data.count;
        dailyElement.style.color = '';
        dailyElement.removeAttribute('data-error');

    } catch (error) {
        console.error('Daily queries load error:', error);
        dailyElement.textContent = 'ERR';
        dailyElement.style.color = '#ff4444';
        dailyElement.setAttribute('data-error', error.message);
    }
}

// ==================== HISTORY POPULATION ====================
function populateHistoryTable(requests) {
    const tbody = document.getElementById('requestHistoryBody');
    tbody.innerHTML = requests.map(request => `
        <tr class="expandable-row" onclick="toggleRequestDetails(${request.id}, this)">
            <td class="clickable-title">${request.title}</td>
            <td>${request.type.toUpperCase()}</td>
            <td><span class="status-tag ${request.status}">${request.status.toUpperCase()}</span></td>
            <td>${new Date(request.created_at).toLocaleDateString('en-IN')}</td>
        </tr>
        <tr class="details-row" id="details-${request.id}">
            <td colspan="4">
                <div class="detail-content-grid">
                    <div class="detail-section">
                        <p><strong>Submitted:</strong> ${new Date(request.created_at).toLocaleString('en-IN')}</p>
                        <p><strong>Decision By:</strong> ${request.decision_by || 'Pending'}</p>
                    </div>
                    <div class="content-section">
                        ${request.type === 'pdf' ? 
                            `<div class="pdf-filename">
                                <strong>Document:</strong> 
                                <span>${request.content.replace('PDF:', '')}</span>
                            </div>` : 
                            `<p><strong>Content:</strong><br>${request.content}</p>`
                        }
                        ${request.description ? 
                            `<div class="description-box">
                                <strong>Description:</strong>
                                <p>${request.description}</p>
                            </div>` : 
                            ''
                        }
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
}

function toggleRequestDetails(requestId) {
    const detailsRow = document.getElementById(`details-${requestId}`);
    const titleElement = document.querySelector(`#details-${requestId}`).previousElementSibling;
    
    // Collapse previous expanded row
    if (currentExpandedId && currentExpandedId !== requestId) {
        const prevDetails = document.getElementById(`details-${currentExpandedId}`);
        prevDetails.classList.remove('expanded');
        prevDetails.previousElementSibling.style.background = 'white';
    }

    // Toggle current row
    detailsRow.classList.toggle('expanded');
    titleElement.style.background = detailsRow.classList.contains('expanded') ? '#f1f8ff' : 'white';
    currentExpandedId = detailsRow.classList.contains('expanded') ? requestId : null;

    // Scroll to view if expanding
    if (detailsRow.classList.contains('expanded')) {
        detailsRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function closeRequestHistory() {
    document.getElementById('requestHistoryModal').style.display = 'none';
    currentExpandedId = null;
    document.querySelectorAll('.details-row').forEach(row => row.classList.remove('expanded'));
    document.querySelectorAll('.expandable-row').forEach(row => row.style.background = 'white');
}
// ----------------------------------------------------------------

// Toggle PDF/Text Input
function togglePDFField() {
    const type = document.getElementById('knowledgeType').value;
    document.getElementById('textContentGroup').style.display = type === 'pdf' ? 'none' : 'block';
    document.getElementById('pdfContentGroup').style.display = type === 'pdf' ? 'block' : 'none';
    
    // Update required fields
    document.getElementById('knowledgeContent').required = type !== 'pdf';
    document.getElementById('knowledgePDF').required = type === 'pdf';
}


// ==================== ERROR TOAST HANDLER ====================
function showErrorToast(message) {
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    toast.style.display = 'block';
    setTimeout(() => {
        toast.remove();
    }, 5000);
}


// Logout Handler
function handleLogout() {
    fetch(`${API_BASE_URL}/logout`, {
        method: 'POST',
        credentials: 'include'
    }).then(() => {
        window.location.href = '/frontend/templates/admin-login.html';
    }).catch(error => {
        console.error('Logout Error:', error);
    });
}
//working

// ==================== DEBUG PDF LIST ====================
async function loadDebugPDFList() {
    try {
        const response = await fetch(`${API_BASE_URL}/debug/pdf-requests`, {
            credentials: 'include'
        });
        const { requests } = await response.json();
        
        const tbody = document.getElementById('pdfDebugBody');
        tbody.innerHTML = requests.map(req => `
            <tr>
                <td>${req.email}</td>
                <td>
                    <span class="pdf-link" 
                          onclick="handlePDFPreview('${req.filename}')">
                        ${req.filename}
                    </span>
                </td>
                <td>${req.status.toUpperCase()}</td>
                <td>
                    <button onclick="sendToPythonBackend('${req.filename}')">
                        Process PDF
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Debug PDF load error:', error);
    }
}

// ==================== UPDATED PDF PREVIEW HANDLER ====================
async function handlePDFPreview(filename) {
    try {
        const url = `${API_BASE_URL}/debug/pdf/${encodeURIComponent(filename)}`;
        console.log('[DEBUG] Fetching PDF from:', url);
        
        const response = await fetch(url, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        const blob = await response.blob();
        const pdfUrl = window.URL.createObjectURL(blob);
        window.open(pdfUrl, '_blank');
        
    } catch (error) {
        console.error('[DEBUG] PDF Error:', error);
        alert('DEBUG: Failed to preview PDF. Check console for details.');
    }
}

// ==================== PYTHON BACKEND INTEGRATION ====================
async function sendToPythonBackend(filename) {
    try {
        // Get PDF data from Node.js backend
        const pdfResponse = await fetch(`${API_BASE_URL}/knowledge-files/${encodeURIComponent(filename)}`, {
            credentials: 'include'
        });
        
        if (!pdfResponse.ok) throw new Error('Failed to fetch PDF');
        
        const blob = await pdfResponse.blob();
        const formData = new FormData();
        formData.append('pdf', blob, filename);

        // Send to Python backend
        const pythonResponse = await fetch('http://localhost:7860/scrape-pdf-file', {
            method: 'POST',
            body: formData
        });

        const result = await pythonResponse.json();
        alert(`Python backend response: ${result.message}`);
        
    } catch (error) {
        console.error('Python integration error:', error);
        alert('NRSC: Failed to process PDF');
    }
}