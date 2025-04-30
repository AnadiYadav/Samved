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
function initializeCharts() {
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

    // Approval Status Chart 
    const approvalCtx = document.getElementById('approvalChart').getContext('2d');
    new Chart(approvalCtx, {
        type: 'pie',
        data: {
            labels: ['Approved', 'Pending', 'Rejected'],
            datasets: [{
                data: [70, 15, 15],
                backgroundColor: ['#4CAF50', '#FFC107', '#F44336']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });

    // Sentiment Analysis Chart
const sentimentCtx = document.getElementById('sentimentChart').getContext('2d');

// Get CSS variables properly
const style = getComputedStyle(document.documentElement);
const successGreen = style.getPropertyValue('--success-green').trim();
const warningYellow = style.getPropertyValue('--warning-yellow').trim();
const errorRed = style.getPropertyValue('--error-red').trim();

new Chart(sentimentCtx, {
    type: 'doughnut',
    data: {
        labels: ['Positive', 'Neutral', 'Negative'],
        datasets: [{
            data: [65, 25, 10],
            backgroundColor: [
                hexToRGBA(successGreen, 0.8),
                hexToRGBA(warningYellow, 0.8),
                hexToRGBA(errorRed, 0.8)
            ]
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                position: 'bottom',
                labels: {
                    font: {
                        size: 14
                    }
                }
            }
        },
        cutout: '70%'
    }
});

function hexToRGBA(hex, alpha = 1) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Validate values
    if (isNaN(r) || isNaN(g) || isNaN(b)) {
        console.error('Invalid hex color:', hex);
        return `rgba(0, 0, 0, ${alpha})`; // Fallback to black
    }
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

    // Visitor Statistics Chart 
    const visitorCtx = document.getElementById('visitorChart').getContext('2d');
    new Chart(visitorCtx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Monthly Visitors',
                data: [65, 59, 80, 81, 56, 55],
                borderColor: '#0066b2',
                tension: 0.4,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            }
        }
    });
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
        chart.data.datasets[0].data = [70, pendingCount, 15];
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

// Request History Functions
function showRequestHistory() {
    document.getElementById('historyModal').style.display = 'block';
    loadRequestHistory();
}

function closeHistoryModal() {
    document.getElementById('historyModal').style.display = 'none';
}

async function loadRequestHistory() {
    try {
        const response = await fetch(`${API_BASE_URL}/request-history`, {
            credentials: 'include'
        });
        const { requests } = await response.json();
        
        const tbody = document.getElementById('historyBody');
        tbody.innerHTML = requests.map(request => `
            <tr>
                <td>${request.admin_email}</td>
                <td>${request.title}</td>
                <td>${request.type.toUpperCase()}</td>
                <td><span class="decision-${request.status}">${request.decision}</span></td>
                <td>${new Date(request.decision_at).toLocaleDateString('en-IN')}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Request history error:', error);
    }
}

// ==================== DAILY QUERIES (SUPERADMIN) ====================
// ==================== COMPLETE DAILY QUERIES HANDLER ====================
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

// Handle Information Submission from direct form
// Handle Information Submission
// Handle Information Submission
// Handle Information Submission
// Processing state variables
// let currentJobId = null;
let isProcessing = false;

// ==================== INFORMATION SUBMISSION HANDLER ====================
// ==================== INFORMATION SUBMISSION HANDLER ====================
document.getElementById('informationForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const PROXY_URL = 'http://localhost:3001/proxy';
    const statusElement = document.getElementById('scrapingStatus');
    const progressBar = statusElement.querySelector('.progress-bar');

    try {
        const contentType = document.getElementById('infoType').value;
        if (!contentType) {
            alert('Please select a content type');
            return;
        }

        // Reset UI
        statusElement.style.display = 'block';
        progressBar.style.width = '0%';
        document.getElementById('processingList').innerHTML = '';

        if (contentType === 'link') {
            const url = document.getElementById('infoUrl').value;
            
            // Validate URL
            try {
                new URL(url);
            } catch {
                alert('Please enter a valid URL');
                return;
            }

            // Step 1: Get links through proxy
            statusElement.querySelector('.toast-content').textContent = 'Analyzing website structure...';
            
            const scrapeResponse = await fetch(`${PROXY_URL}/scrape-url`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    'base-html': url,  // Correct key with hyphen
                    'perm-url': url    // Correct key with hyphen
                })
            });
            
            if (!scrapeResponse.ok) {
                const error = await scrapeResponse.json().catch(() => ({ detail: 'Website analysis failed' }));
                throw new Error(error.detail);
            }

            const { pdf_links = [], all_links = [] } = await scrapeResponse.json();
            const totalLinks = all_links.length + pdf_links.length;
            let successCount = 0;
            let errorCount = 0;
            
            // Process HTML links
            if (all_links.length > 0) {
                for (const link of all_links) {
                    try {
                        await fetch(`${PROXY_URL}/scrape-page`, {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({
                                url: link,
                                'scrape-images': false  // Correct key with hyphen
                            })
                        });
                        successCount++;
                    } catch (error) {
                        errorCount++;
                        console.error(`Failed to process ${link}:`, error);
                    }
                }
            }

            // Process PDF links
            if (pdf_links.length > 0) {
                for (const link of pdf_links) {
                    try {
                        await fetch(`${PROXY_URL}/scrape-pdf`, {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({
                                url: link,
                                'scrape-image': false  // Correct key with hyphen
                            })
                        });
                        successCount++;
                    } catch (error) {
                        errorCount++;
                        console.error(`Failed to process ${link}:`, error);
                    }
                }
            }

            // Store result in localStorage
            // Inside your informationForm submit handler, replace the job creation with:
                const jobResult = {
                    id: Date.now(),
                    timestamp: new Date().toISOString(),
                    url: contentType === 'link' ? document.getElementById('infoUrl').value : 'PDF Upload',
                    total: totalLinks,
                    success: successCount,
                    failed: errorCount,
                    status: errorCount === 0 ? 'completed' : 
                        errorCount === totalLinks ? 'failed' : 'partial'
                };
                updateProcessingHistory(jobResult);
            statusElement.querySelector('.toast-content').textContent = 
                `Processed ${successCount} links successfully (${errorCount} failed)!`;

        } else if (contentType === 'pdf') {
            const fileInput = document.getElementById('infoPdf');
            if (!fileInput.files.length) {
                alert('Please select a PDF file');
                return;
            }

            statusElement.querySelector('.toast-content').textContent = 'Uploading PDF...';
            
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);

            const response = await fetch(`${PROXY_URL}/scrape-pdf-file`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: 'PDF processing failed' }));
                throw new Error(error.detail);
            }

            statusElement.querySelector('.toast-content').textContent = 'PDF processed successfully!';
        }

        setTimeout(() => {
            statusElement.style.display = 'none';
            document.getElementById('informationForm').reset();
        }, 3000);

    } catch (error) {
        console.error('Processing Error:', error);
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