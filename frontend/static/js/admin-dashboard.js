/**
 * NRSC Admin Dashboard Controller
 * Handles dashboard visualization and knowledge submission
 */

// Configuration
const API_BASE_URL = 'http://localhost:3000/api';



// ==================== AUTH TOKEN MANAGEMENT ====================
const TOKEN_KEY = 'nrscAuthToken';

// Get token from localStorage
function getAuthToken() {
    return localStorage.getItem(TOKEN_KEY);
}

// Remove token from localStorage
function removeAuthToken() {
    localStorage.removeItem(TOKEN_KEY);
}


// Initialize Dashboard with Authentication Check
document.addEventListener('DOMContentLoaded', async () => {

        const token = getAuthToken();
        if (!token) {
            window.location.href = '/frontend/templates/admin-login.html';
            return;
        }

    try {
        // Verify authentication status
        const authCheck = await fetch(`${API_BASE_URL}/admin-data`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        const authData = await authCheck.json();
        
        if (!authCheck.ok || authData.user.role !== 'admin') {
            removeAuthToken(); 
            window.location.href = '/frontend/templates/admin-login.html';
            return;
        }

        // Initialize dashboard components
        initializeCharts();
        loadActiveSessions();
        loadPendingRequests();
        loadTotalQueries();
        setInterval(() => {
            loadActiveSessions();
            loadTotalQueries(); // Refresh daily count periodically
        }, 120000);
        
        // Form submission handler
        document.getElementById('knowledgeForm').addEventListener('submit', handleKnowledgeSubmission);
        document.querySelector('.btn-logout').addEventListener('click', handleLogout);

    } catch (error) {
        console.error('Authentication check failed:', error);
        removeAuthToken();
        window.location.href = '/frontend/templates/admin-login.html';
    }
});


// Chart Initialization
async function initializeCharts() {
    
    // Frequently Asked Questions Chart
    const faqCtx = document.getElementById('faqChart').getContext('2d');
    
    try {
        const response = await fetch(`${API_BASE_URL}/admin/category-stats`, {
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { data } = await response.json();
        
        // Define abbreviations for long labels
        const labelAbbreviations = {
            "Data Products, Services and Policies": "Data Products",
            "EO Missions": "EO Missions",
            "Applications": "Applications",
            "Remote Sensing and GIS": "Remote Sensing & GIS",
            "International Collaboration and Cooperation": "Intrnl. Collaboration"
        };
        
        // Use abbreviations for display
        const displayLabels = data.labels.map(label => 
            labelAbbreviations[label] || label
        );

        new Chart(faqCtx, {
            type: 'bar',
            data: {
                labels: displayLabels,
                datasets: [{
                    label: 'Questions Count',
                    data: data.counts,
                    backgroundColor: [
                        'rgba(54, 162, 235, 0.8)',   // Blue
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (context) => data.labels[context.dataIndex], // Full name in tooltip
                            label: (context) => `Queries: ${context.raw}`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            maxRotation: 45, // Rotate labels 45 degrees
                            minRotation: 10,
                            autoSkip: false,
                            font: {
                                size: 12
                            }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Question Count' }
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('FAQ chart error:', error);
        // Fallback to empty chart
        new Chart(faqCtx, {
            type: 'bar',
            data: { labels: [], datasets: [] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // Visitor Statistics Chart
    const visitorCtx = document.getElementById('visitorChart').getContext('2d');
    
    try {
        const response = await fetch(`${API_BASE_URL}/visitor-stats`, {
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
        headers: {
        'Authorization': `Bearer ${getAuthToken()}`
        }
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
                backgroundColor: ['#03A31C', '#FFC107', 'red']
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
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
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
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
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
        const token = getAuthToken();
        const response = await fetch(`${API_BASE_URL}/knowledge-requests`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
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
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        const { requests } = await response.json();
        populateHistoryTable(requests);
    } catch (error) {
        console.error('Request history error:', error);
        alert('Failed to load request history');
    }
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
async function handleLogout() {
    try {
        await fetch(`${API_BASE_URL}/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        removeAuthToken();
        window.location.href = '/frontend/templates/admin-login.html';
    }
}
//working