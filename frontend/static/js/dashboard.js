/**
 * NRSC Superadmin Dashboard Controller
 * Handles analytics visualization and admin management
 */


// Configuration
const API_BASE_URL = 'http://localhost:3000/api';
const SCRAPE_BASE_URL = 'http://localhost:7860';


// DOM Elements
const logoutBtn = document.querySelector('.btn-logout');
const addAdminBtn = document.querySelector('.btn-primary');
const adminModal = document.getElementById('adminModal');
const adminForm = document.getElementById('adminForm');


// ==================== COMMON AUTH TOKEN ====================
function getAuthToken() {
    const cookie = document.cookie.split('; ')
        .find(row => row.startsWith('authToken='));
    return cookie ? cookie.split('=')[1] : null;
}

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const authCheck = await fetch(`${API_BASE_URL}/admin-data`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });

        const authData = await authCheck.json();
        
        if (!authCheck.ok || authData.user.role !== 'superadmin') {
            document.cookie = 'authToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            window.location.href = '/frontend/templates/admin-login.html';
            return;
        }

        initializeCharts();
        loadActiveSessions();
        loadPendingRequests();
        loadTotalAdmins();
        loadTotalQueries();
        showProcessingHistory();
        // Refresh every 30 seconds
        setInterval(() => {
            loadActiveSessions();
            loadTotalQueries();
        }, 30000);

        logoutBtn.addEventListener('click', handleLogout);
        addAdminBtn.addEventListener('click', showAdminForm);
        adminForm.addEventListener('submit', handleAdminCreation);

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
            plugins: {
                legend: { display: false }
            }
        }
    });

    // APPROVAL CHART INITIALIZATION ====================
    initializeApprovalChart();
    let approvalChartInstance = null;

    async function initializeApprovalChart() {
    try {
        const response = await fetch(`${API_BASE_URL}/superadmin/approval-stats`, {
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to fetch approval data');
        const { data } = await response.json();

        // Destroy previous instance
        if (approvalChartInstance) {
            approvalChartInstance.destroy();
        }

        // Create new chart with real data
        const ctx = document.getElementById('approvalChart').getContext('2d');
        approvalChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Approved', 'Pending', 'Rejected'],
                datasets: [{
                    data: [
                        data.approved || 0,
                        data.pending || 0,
                        data.rejected || 0
                    ],
                    backgroundColor: ['#03A31C', '#FFC107', 'red']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            generateLabels: (chart) => {
                                return chart.data.datasets[0].data.map((value, index) => ({
                                    text: `${chart.data.labels[index]}: ${value}`,
                                    fillStyle: chart.data.datasets[0].backgroundColor[index]
                                }));
                            }
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error('Approval chart error:', error);
        initializeFallbackApprovalChart();
    }
}

    function initializeFallbackApprovalChart() {
        const ctx = document.getElementById('approvalChart').getContext('2d');
        if (approvalChartInstance) approvalChartInstance.destroy();
        
        approvalChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Approved', 'Pending', 'Rejected'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#03A31C', '#FFC107', 'red']
                }]
            }
        });
}

    
    // Get CSS variables properly
    const style = getComputedStyle(document.documentElement);
    const successGreen = style.getPropertyValue('--success-green').trim();
    const warningYellow = style.getPropertyValue('--warning-yellow').trim();
    const errorRed = style.getPropertyValue('--error-red').trim();
    
    // SENTIMENT CHART ====================
initializeSentimentChart();

let superadminSentimentChart = null;

async function initializeSentimentChart() {
    try {
        const response = await fetch(`${API_BASE_URL}/superadmin/sentiment`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const { data } = await response.json();

        if (superadminSentimentChart) superadminSentimentChart.destroy();

        const ctx = document.getElementById('sentimentChart').getContext('2d');
        superadminSentimentChart = new Chart(ctx, {
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
    if (superadminSentimentChart) superadminSentimentChart.destroy();
    superadminSentimentChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

    // Visitor Statistics Chart 
    const visitorCtx = document.getElementById('visitorChart').getContext('2d');
    
    try {
        const response = await fetch(`${API_BASE_URL}/superadmin/visitor-stats`, {
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
                    data: data.datasets.visitors,
                    borderColor: '#0066b2',
                    tension: 0.4,
                    fill: false,
                    pointRadius: 4
                },
                {
                    label: 'Total Interactions',
                    data: data.datasets.interactions,
                    borderColor: '#FF671F',
                    tension: 0.4,
                    fill: false,
                    pointRadius: 4,
                    borderDash: [5, 5]
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
                            label: (context) => 
                                `${context.dataset.label}: ${context.raw}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Count' }
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
}


// Load Active Sessions 
async function loadActiveSessions() {
    try {
        const response = await fetch(`${API_BASE_URL}/active-sessions`, {
            credentials: 'include'
        });
        const data = await response.json();
        document.getElementById('activeSessions').textContent = data.count;
    } catch (error) {
        console.error('NRSC Session Error:', error);
    }
}

// Load Pending Requests 
async function loadPendingRequests() {
    try {
        const response = await fetch(`${API_BASE_URL}/knowledge-requests/pending`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to fetch requests');
        
        const { requests } = await response.json();
        
        // Update pending requests count
        document.getElementById('pendingApprovals').textContent = requests.length;
        document.getElementById('pendingCount').textContent = requests.length;

        // Update approval chart data
        updateApprovalChart(requests.length);

        // Populate requests table
        const tbody = document.getElementById('requestsBody');
        tbody.innerHTML = requests.map(request => `
        <tr>
                <td>${request.admin_email}</td>
                <td class="request-title">${request.type.toUpperCase()} - ${request.title}</td>
                <td>${new Date(request.created_at).toLocaleDateString('en-IN')}</td>
                <td class="action-buttons">
                    <button class="btn-approve" data-id="${request.id}">Approve</button>
                    <button class="btn-reject" data-id="${request.id}">Reject</button>
                </td>
        </tr>
        `).join('');

        // Add event listeners to action buttons
        document.querySelectorAll('.btn-approve').forEach(btn => {
            btn.addEventListener('click', () => handleRequestAction(btn.dataset.id, 'approve'));
        });
        
        document.querySelectorAll('.btn-reject').forEach(btn => {
            btn.addEventListener('click', () => handleRequestAction(btn.dataset.id, 'reject'));
        });

    } catch (error) {
        console.error('NRSC Request Error:', error);
    }
}

// Update approval chart data
function updateApprovalChart(pendingCount) {
    const chart = Chart.getChart('approvalChart');
    if (chart) {
        chart.update();
    }
}

// Handle request approval/rejection
async function handleRequestAction(requestId, action) {
    try {
        const response = await fetch(`${API_BASE_URL}/knowledge-requests/${requestId}/${action}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error('Action failed');

        const result = await response.json();
        alert(`NRSC: Request ${action}d successfully`);
        loadPendingRequests(); // Refresh the list

        // If approved, process the content
        if (action === 'approve' && result.filePath) {
            await processApprovedContent(result);
        }

    } catch (error) {
        console.error(`NRSC ${action} Error:`, error);
        alert(`NRSC: Failed to ${action} request`);
    }
}

// Process approved content (placeholder for vector store integration)
async function processApprovedContent(result) {
    console.log('NRSC: Processing approved content', result);
    // Add vector store processing logic here
}

// Admin Management Functions 
function showAdminForm() {
    document.getElementById('adminModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('adminModal').style.display = 'none';
}

async function handleAdminCreation(e) {
    e.preventDefault();
    
    const adminData = {
        email: document.getElementById('adminEmail').value,
        password: document.getElementById('adminPassword').value,
        role: document.getElementById('adminRole').value
    };

    try {
        const response = await fetch(`${API_BASE_URL}/create-admin`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(adminData)
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.errors?.join('\n') || result.message || 'Creation failed');
        }

        alert('NRSC: Admin created successfully!');
        closeModal();
    } catch (error) {
        console.error('NRSC Admin Creation Error:', error);
        alert(`NRSC Error: ${error.message}`);
    }
}

// Information Modal Controls

function showInformationForm() {
    document.getElementById('informationModal').style.display = 'block';
    document.getElementById('infoType').value = '';
    toggleInfoField(); // Reset fields
}

function closeInformationModal() {
    document.getElementById('informationModal').style.display = 'none';
    document.getElementById('informationForm').reset();
}

function toggleInfoField() {
    const type = document.getElementById('infoType').value;
    document.getElementById('urlFieldGroup').style.display = type === 'link' ? 'block' : 'none';
    document.getElementById('pdfFieldGroup').style.display = type === 'pdf' ? 'block' : 'none';
    
    // Set required attributes dynamically
    document.getElementById('infoUrl').required = type === 'link';
    document.getElementById('infoPdf').required = type === 'pdf';
}


// function to load total admins
async function loadTotalAdmins() {
    try {
        const response = await fetch(`${API_BASE_URL}/total-admins`, {
            credentials: 'include'
        });
        const data = await response.json();
        document.getElementById('totalAdmins').textContent = data.count;
    } catch (error) {
        console.error('Total admins error:', error);
    }
}


// Replace existing request history functions with:

let currentExpandedId = null;

// Show Request History Modal
function showRequestHistory() {
    document.getElementById('requestHistoryModal').style.display = 'block';
    loadSuperadminRequestHistory();
}

// Close Modal
function closeRequestHistory() {
    document.getElementById('requestHistoryModal').style.display = 'none';
    currentExpandedId = null;
}

// Load Superadmin Request History
async function loadSuperadminRequestHistory() {
    try {
        const response = await fetch(`${API_BASE_URL}/superadmin/request-history`, {
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        const { requests } = await response.json();
        populateSuperadminHistoryTable(requests);
        
    } catch (error) {
        console.error('Request history error:', error);
        alert('Failed to load request history');
    }
}

// Populate History Table
function populateSuperadminHistoryTable(requests) {
    const tbody = document.getElementById('superadminHistoryBody');
    tbody.innerHTML = requests.map(request => `
        <tr class="expandable-row" onclick="toggleRequestDetails('${request.id}', this)">
            <td class="clickable-title">${request.title}</td>
            <td>${request.admin_email}</td>
            <td>${request.type.toUpperCase()}</td>
            <td><span class="status-tag ${request.status}">${request.status.toUpperCase()}</span></td>
            <td>${new Date(request.created_at).toLocaleDateString('en-IN')}</td>
        </tr>
        <tr class="details-row" id="details-${request.id}">
            <td colspan="5">
                <div class="detail-content-grid">
                    <div class="detail-section">
                        <p><strong>Submitted By:</strong> ${request.admin_email}</p>
                        <p><strong>Submitted At:</strong> ${new Date(request.created_at).toLocaleString('en-IN')}</p>
                        <p><strong>Decision By:</strong> ${request.decision_by || 'Pending'}</p>
                        <p><strong>Decision At:</strong> ${request.decision_at ? new Date(request.decision_at).toLocaleString('en-IN') : 'N/A'}</p>
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

// Toggle Request Details
function toggleRequestDetails(requestId, element) {
    const detailsRow = document.getElementById(`details-${requestId}`);
    const titleRow = element.closest('tr');

    // Collapse previous expanded row
    if (currentExpandedId && currentExpandedId !== requestId) {
        const prevDetails = document.getElementById(`details-${currentExpandedId}`);
        prevDetails.classList.remove('expanded');
        prevDetails.previousElementSibling.style.background = 'white';
    }

    // Toggle current row
    detailsRow.classList.toggle('expanded');
    titleRow.style.background = detailsRow.classList.contains('expanded') ? '#f1f8ff' : 'white';
    currentExpandedId = detailsRow.classList.contains('expanded') ? requestId : null;

    // Scroll to view if expanding
    if (detailsRow.classList.contains('expanded')) {
        detailsRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}


// ==================== TOTAL QUERIES HANDLER ====================
async function loadTotalQueries() {
    const totalElement = document.getElementById('dailyQueries');
    
    try {
        const response = await fetch(`${API_BASE_URL}/superadmin/total-queries`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server responded with ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (typeof data.success === 'undefined' || typeof data.count === 'undefined') {
            throw new Error('Invalid response format from server');
        }

        if (!data.success) {
            throw new Error(data.message || 'Failed to load query count');
        }

        totalElement.textContent = data.count;
        totalElement.style.color = '';
        totalElement.removeAttribute('data-error');

    } catch (error) {
        console.error('Total queries load error:', error);
        totalElement.textContent = 'ERR';
        totalElement.style.color = '#ff4444';
        totalElement.setAttribute('data-error', error.message);
    }
}


let isProcessing = false;

// ==================== INFORMATION SUBMISSION HANDLER ====================

document.getElementById('informationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const PROXY_URL = 'http://localhost:3001/proxy';
    const statusElement = document.getElementById('scrapingStatus');

    try {
        const contentType = document.getElementById('infoType').value;
        if (!contentType) {
            alert('Please select a content type');
            return;
        }

        statusElement.style.display = 'block';
        statusElement.querySelector('.toast-content').textContent = 'Initializing processing...';

        if (contentType === 'link') {
            const url = document.getElementById('infoUrl').value;
            
            try {
                new URL(url);
            } catch {
                alert('Please enter a valid URL');
                return;
            }

            const response = await fetch(`${PROXY_URL}/initiate-processing`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ url: url })
            });

            if (!response.ok) throw new Error('Failed to start processing');
            
            const { jobId } = await response.json();
            statusElement.querySelector('.toast-content').textContent = 'Processing started on server';

        } else if (contentType === 'pdf') {
            const fileInput = document.getElementById('infoPdf');
            if (!fileInput.files.length) {
                alert('Please select a PDF file');
                return;
            }

            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('scrape-images', 'false');

            const response = await fetch(`${PROXY_URL}/scrape-pdf-file`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('PDF processing failed');
            statusElement.querySelector('.toast-content').textContent = 'PDF processed successfully!';
        }

        setTimeout(() => {
            statusElement.style.display = 'none';
            document.getElementById('informationForm').reset();
        }, 3000);

    } catch (error) {
        statusElement.querySelector('.toast-content').textContent = `Error: ${error.message}`;
        statusElement.classList.add('error');
        setTimeout(() => statusElement.style.display = 'none', 5000);
    }
});

// ==================== PROCESSING HISTORY MANAGEMENT ====================
// ==================== PROCESSING HISTORY MANAGEMENT ====================
function updateProcessingHistory(job) {
    try {
        let history = JSON.parse(localStorage.getItem('processingHistory') || '[]');
        
        // Ensure job has proper ID if not set
        if (!job.id) {
            job.id = Date.now();
        }
        if (!job.timestamp) {
            job.timestamp = new Date().toISOString();
        }
        
        history.unshift(job);
        localStorage.setItem('processingHistory', JSON.stringify(history.slice(0, 20))); // Keep last 20 jobs
        showProcessingHistory();
    } catch (error) {
        console.error('Error updating history:', error);
    }
}

// Update showProcessingHistory function in dashboard.js
function showProcessingHistory() {
    try {
        const history = JSON.parse(localStorage.getItem('processingHistory') || '[]');
        const historyContainer = document.getElementById('jobsList');
        
        historyContainer.innerHTML = history.map(job => {
            const date = new Date(job.timestamp);
            return `
            <div class="history-item ${job.status}">
                <div class="job-meta">
                    <span class="job-id">#${job.id}</span>
                    <span class="job-status status-${job.status}">
                        ${job.status.toUpperCase()}
                    </span>
                    <span>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</span>
                </div>
                <div class="job-stats">
                    <span>Total: ${job.total}</span>
                    <span>Success: ${job.success}</span>
                    <span>Failed: ${job.failed}</span>
                </div>
                <button class="delete-history" onclick="deleteHistoryItem(${job.id})">
                    &times;
                </button>
            </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error showing history:', error);
    }
}

function deleteHistoryItem(jobId) {
    try {
        let history = JSON.parse(localStorage.getItem('processingHistory') || '[]');
        history = history.filter(job => job.id !== jobId);
        localStorage.setItem('processingHistory', JSON.stringify(history));
        showProcessingHistory();
    } catch (error) {
        console.error('Error deleting history item:', error);
    }
}



// ==================== HISTORY MANAGEMENT ====================
function updateHistory() {
    const jobs = JSON.parse(localStorage.getItem('processingJobs') || []);
    jobs.unshift(currentJob);
    localStorage.setItem('processingJobs', JSON.stringify(jobs.slice(0, 10))); // Keep last 10 jobs
    
    const historyHTML = jobs.map(job => `
        <div class="job-item">
            <div class="job-header">
                <span class="job-id">#${job.id}</span>
                <button class="delete-job" onclick="deleteJob('${job.id}')">×</button>
                <span class="job-status ${job.status}">${job.status.toUpperCase()}</span>
            </div>
            <div class="job-stats">
                <span>Processed: ${job.processed}/${job.total}</span>
                <span>Success: ${job.success.length}</span>
                <span>Failed: ${job.failed.length}</span>
            </div>
        </div>
    `).join('');
    
    document.getElementById('jobsList').innerHTML = historyHTML;
}

function deleteJob(jobId) {
    const jobs = JSON.parse(localStorage.getItem('processingJobs')) || [];
    const filtered = jobs.filter(job => job.id !== jobId);
    localStorage.setItem('processingJobs', JSON.stringify(filtered));
    updateHistory();
}



// Initialize history display on page load
// updateHistoryDisplay();




// Logout Handler 
function handleLogout() {
    fetch(`${API_BASE_URL}/logout`, {
        method: 'POST',
        credentials: 'include'
    }).then(() => {
        window.location.href = '/frontend/templates/admin-login.html';
    }).catch(error => {
        console.error('NRSC Logout Error:', error);
    });
}