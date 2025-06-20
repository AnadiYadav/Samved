/**
 * NRSC Authentication Module
 * Handles secure admin login and API communication with role-based redirection
 */

// DOM Elements
const loginForm = document.getElementById('adminLoginForm');

// Configuration
const API_BASE_URL = 'http://localhost:3000';
const LOGIN_ENDPOINT = '/api/login';
const ADMIN_DATA_ENDPOINT = '/api/admin-data';

// Dashboard Paths
const ADMIN_DASHBOARD_PATH = '/frontend/templates/admin-dashboard.html';
const SUPERADMIN_DASHBOARD_PATH = '/frontend/templates/superadmin-dashboard.html';

/** Handle login form submission */
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(API_BASE_URL + LOGIN_ENDPOINT, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Authentication failed');
        }

        // Store token in localStorage
        localStorage.setItem('nrscAuthToken', data.token);

        // Check user role and redirect accordingly
        if (data.user && data.user.role) {
            switch (data.user.role) {
                case 'superadmin':
                    window.location.href = SUPERADMIN_DASHBOARD_PATH;
                    break;
                case 'admin':
                    window.location.href = ADMIN_DASHBOARD_PATH;
                    break;
                default:
                    throw new Error('Unauthorized role detected');
            }
        } else {
            throw new Error('User role information missing in response');
        }
        
    } catch (error) {
        showErrorAlert(error.message);
        console.error('Login Error:', error);
    }
});

/** Secure fetch wrapper for authenticated requests */
export async function secureFetch(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            credentials: 'include',
            headers: {
                ...options.headers,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 401) {
            handleUnauthorized();
            return null;
        }

        return response;
    } catch (error) {
        console.error('API Request Failed:', error);
        return null;
    }
}

/** Fetch admin-specific data */
export async function getAdminData() {
    try {
        const response = await secureFetch(API_BASE_URL + ADMIN_DATA_ENDPOINT);
        
        if (!response?.ok) {
            throw new Error('Failed to fetch admin data');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Admin Data Error:', error);
        return null;
    }
}

/** Error handling utilities */
function showErrorAlert(message) {
    alert(`Security Alert: ${message}\n\nPlease contact NRSC system administrator.`);
}

function handleUnauthorized() {
    window.location.href = '/frontend/templates/admin-login.html?session=expired';
}