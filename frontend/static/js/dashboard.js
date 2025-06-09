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




// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
    
    // Check if token exists
    const token = getAuthToken();
    if (!token) {
        window.location.href = '/frontend/templates/admin-login.html';
        return;
    }
    
    
    try {
        const authCheck = await fetch(`${API_BASE_URL}/admin-data`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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
        }, 120000);

        logoutBtn.addEventListener('click', handleLogout);
        addAdminBtn.addEventListener('click', showAdminForm);
        adminForm.addEventListener('submit', handleAdminCreation);

    } catch (error) {
        console.error('Authentication check failed:', error);
        removeAuthToken();
        // document.cookie = 'authToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        window.location.href = '/frontend/templates/admin-login.html';
    }
});

// Chart Initialization 
async function initializeCharts() {
    // Frequently Asked Questions Chart
    const faqCtx = document.getElementById('faqChart').getContext('2d');

        try {
            const response = await fetch(`${API_BASE_URL}/superadmin/category-stats`, {
                credentials: 'include',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`
                }
            });
            
            if (!response.ok) throw new Error('Failed to fetch FAQ data');
            
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
                        backgroundColor: 'rgba(0, 102, 178, 0.8)',
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 30,
                                autoSkip: false,
                                font: {
                                    size: 12
                                }
                            }
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
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        const data = await response.json();
        document.getElementById('activeSessions').textContent = data.count;
    } catch (error) {
        console.error('NRSC Session Error:', error);
    }
}

// Load Pending Requests 
let currentExpandedRequest = null;

async function loadPendingRequests() {
    try {
        const response = await fetch(`${API_BASE_URL}/knowledge-requests/pending`, {
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
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
            <tr class="main-row" data-id="${request.id}">
                <td>${request.admin_email}</td>
                <td class="request-title" data-id="${request.id}">${request.type.toUpperCase()} - ${request.title}</td>
                <td>${new Date(request.created_at).toLocaleDateString('en-IN')}</td>
                <td class="action-buttons">
                    <button class="btn-approve" data-id="${request.id}">Approve</button>
                    <button class="btn-reject" data-id="${request.id}">Reject</button>
                </td>
            </tr>
            <tr class="details-row" id="details-${request.id}" style="display:none">
                <td colspan="4">
                    <div class="detail-content-grid">
                        <div class="detail-section">
                            <p><strong>Submitted By:</strong> ${request.admin_email}</p>
                            <p><strong>Submitted At:</strong> ${new Date(request.created_at).toLocaleString('en-IN')}</p>
                            ${request.type === 'pdf' ? 
                                `<p><strong>Document:</strong> 
                                    <button class="pdf-link" 
                                            onclick="viewPdf('${request.content.replace('PDF:', '')}')">
                                        ${request.content.replace('PDF:', '')}
                                    </button>
                                </p>` : 
                                `<p><strong>Content:</strong><br>${request.content}</p>`
                            }
                        </div>
                        <div class="detail-section">
                            <p><strong>Description:</strong></p>
                            ${request.description ? 
                                `<div class="description-box">
                                    <p>${request.description}</p>
                                </div>` : 
                                '<p>No description provided</p>'
                            }
                        </div>
                    </div>
                </td>
            </tr>
        `).join('');

        // Add event listeners to title cells
        document.querySelectorAll('#pendingRequestsTable .request-title').forEach(titleCell => {
            titleCell.addEventListener('click', (e) => {
                const requestId = e.target.dataset.id;
                const detailsRow = document.getElementById(`details-${requestId}`);
                
                // Collapse previous expanded row
                if (currentExpandedRequest && currentExpandedRequest !== requestId) {
                    const prevDetails = document.getElementById(`details-${currentExpandedRequest}`);
                    if (prevDetails) prevDetails.style.display = 'none';
                }
                
                // Toggle current row
                detailsRow.style.display = detailsRow.style.display === 'none' ? 'table-row' : 'none';
                currentExpandedRequest = detailsRow.style.display === 'table-row' ? requestId : null;
                
                // Scroll to view if expanding
                if (detailsRow.style.display === 'table-row') {
                    detailsRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            });
        });

        // Add event listeners to action buttons
        document.querySelectorAll('#pendingRequestsTable .btn-approve').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleRequestAction(btn.dataset.id, 'approve');
            });
        });
        
        document.querySelectorAll('#pendingRequestsTable .btn-reject').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleRequestAction(btn.dataset.id, 'reject');
            });
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


/**
 * Fetches a PDF using an auth token and opens it in a new tab.
 * @param {string} filename The name of the PDF file to fetch.
 */
async function viewPdf(filename) {
    try {
        const token = getAuthToken();
        if (!token) {
            alert('Authentication session has expired. Please log in again.');
            return;
        }

        const response = await fetch(`${API_BASE_URL}/knowledge-files/${encodeURIComponent(filename)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Failed to load PDF: ${response.statusText}`);
        }

        const pdfBlob = await response.blob();
        const blobUrl = URL.createObjectURL(pdfBlob);
        window.open(blobUrl, '_blank');

    } catch (error) {
        console.error('PDF view error:', error);
        alert(`Could not display PDF: ${error.message}`);
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

        const token = getAuthToken(); // Get the token

        if (!token) {
            alert('Authentication session has expired. Please log in again.');
            return;
        }

        const response = await fetch(`${API_BASE_URL}/create-admin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(adminData)
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.errors?.join('\n') || result.message || 'Creation failed');
        }

        alert('NRSC: Admin created successfully!');
        closeModal();
        loadTotalAdmins();
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
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        const data = await response.json();
        document.getElementById('totalAdmins').textContent = data.count;
    } catch (error) {
        console.error('Total admins error:', error);
    }
}


//====================  request history functions 

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
        const token=getAuthToken();
        const response = await fetch(`${API_BASE_URL}/superadmin/request-history`, {
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${token}`
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
                                <button class="pdf-link" 
                                        onclick="viewPdf('${request.content.replace('PDF:', '')}')">
                                    ${request.content.replace('PDF:', '')}
                                </button>
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
    const statusElement = document.getElementById('scrapingStatus');
    const PROXY_URL = 'http://localhost:3001/proxy';

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
                headers: {'Content-Type': 'application/json'
                },
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

            const file = fileInput.files[0];
            
            // Send the file directly as binary data
            const response = await fetch(`${PROXY_URL}/scrape-pdf-file`, {
                method: 'POST',
                body: file,
                headers: {
                    'Content-Type': 'application/pdf'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'PDF processing failed');
            }
            
            const result = await response.json();
            statusElement.querySelector('.toast-content').textContent = 
                `PDF processed successfully! ${result.pages} pages indexed`;
        }

        setTimeout(() => {
            statusElement.style.display = 'none';
            document.getElementById('informationForm').reset();
            toggleInfoField();
        }, 5000);

    } catch (error) {
        statusElement.querySelector('.toast-content').textContent = `Error: ${error.message}`;
        statusElement.classList.add('error');
        setTimeout(() => statusElement.style.display = 'none', 10000);
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

// ==================== PROCESSING HISTORY MANAGEMENT ====================
// ==================== PROCESSING HISTORY MANAGEMENT ====================
// ==================== PROCESSING HISTORY MANAGEMENT ====================
async function showProcessingHistory() {
  try {
    const response = await fetch(`${API_BASE_URL}/processing-jobs`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const jobs = await response.json();
    const historyContainer = document.getElementById('jobsList');
    historyContainer.innerHTML = '';
    
    jobs.forEach(job => {
      // Safely access properties with defaults
      const jobId = job.jobId || 'N/A';
      const status = job.status || 'unknown';
      const type = job.type ? job.type.toUpperCase() : 'UNKNOWN';
      const filename = job.filename || '';
      const sourceUrl = job.sourceUrl || '';
      const message = job.message || '';
      const pages = job.pages || 0;
      const total = job.total || 0;
      const processed = job.processed || 0;
      const failedCount = job.failed ? job.failed.length : 0;
      
      // Format date as dd/mm/yyyy
      const timestamp = job.timestamp ? new Date(job.timestamp) : new Date();
      const formattedDate = timestamp.toLocaleDateString('en-GB');
      
      const jobElement = document.createElement('div');
      jobElement.className = `processing-history-item ${status}`;
      jobElement.innerHTML = `
        <div class="processing-job-meta">
          <span class="processing-job-id">#${jobId}</span>
          <span class="processing-job-status processing-status-${status}">
            ${status.toUpperCase()}
          </span>
          <span>${formattedDate}</span>
        </div>
        <div class="processing-job-details">
          <p><strong>Type:</strong> ${type}</p>
          ${filename ? `<p><strong>File:</strong> ${filename}</p>` : ''}
          ${sourceUrl ? `<p><strong>URL:</strong> ${sourceUrl}</p>` : ''}
          <p><strong>Status:</strong> ${message}</p>
          ${pages ? `<p><strong>Pages:</strong> ${pages}</p>` : ''}
          ${total ? `<p><strong>Total:</strong> ${total}</p>` : ''}
          ${processed ? `<p><strong>Processed:</strong> ${processed}</p>` : ''}
          ${failedCount ? `<p><strong>Failed:</strong> ${failedCount}</p>` : ''}
        </div>
        <div class="processing-job-actions">
          <button class="processing-delete-job" data-jobid="${jobId}">×</button>
          ${status === 'failed' ? 
            `<button class="processing-retry-job" data-jobid="${jobId}">↻</button>` : 
            ''
          }
        </div>
      `;
      historyContainer.appendChild(jobElement);
    });

    // Add event listeners for delete buttons
    document.querySelectorAll('.processing-delete-job').forEach(button => {
      button.addEventListener('click', async (e) => {
        const jobId = e.target.dataset.jobid;
        await deleteProcessingJob(jobId);
        showProcessingHistory();
      });
    });

    // Add event listeners for retry buttons
    document.querySelectorAll('.processing-retry-job').forEach(button => {
      button.addEventListener('click', async (e) => {
        const jobId = e.target.dataset.jobid;
        await retryProcessingJob(jobId);
        showProcessingHistory();
      });
    });
    
  } catch (error) {
    console.error('History load error:', error);
    alert('Failed to load processing history: ' + error.message);
  }
}

async function deleteProcessingJob(jobId) {
  try {
    const response = await fetch(`${API_BASE_URL}/processing-jobs/${jobId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Delete failed');
    }
  } catch (error) {
    console.error('Delete job error:', error);
    alert('Failed to delete job');
  }
}

async function retryProcessingJob(jobId) {
  try {
    const response = await fetch(`${API_BASE_URL}/processing-jobs/${jobId}/retry`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Retry failed');
    }
    
    if (result.jobId) {
      alert(`Retry job started with ID: ${result.jobId}`);
      // Refresh processing history after 2 seconds
      setTimeout(showProcessingHistory, 2000);
    } else {
      alert(result.message);
    }
  } catch (error) {
    console.error('Retry job error:', error);
    alert(`Error: ${error.message}`);
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



// ==================== LOGOUT HANDLER ====================
async function handleLogout() {
    try {
        await fetch(`${API_BASE_URL}/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        removeAuthToken();
        window.location.href = '/frontend/templates/admin-login.html';
    } catch (error) {
        console.error('Logout error:', error);
    }
}