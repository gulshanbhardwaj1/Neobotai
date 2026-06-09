// --- DOM MANAGEMENT FOR AUTHENTICATION LAYER ---
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authEmail = document.getElementById('auth-email');
const authPass = document.getElementById('auth-pass');

const authSection = document.getElementById('auth-section');
const profileSection = document.getElementById('profile-section');
const usernameDisplay = document.getElementById('username-display');
const connectionStatus = document.getElementById('connection-status');
const historyBox = document.getElementById('history-box');

let currentAuthMode = 'login'; // Default Mode: Sign In
const API_AUTH_URL = 'http://localhost:3000/api';

document.addEventListener('DOMContentLoaded', () => {
    // Initial UI state setup on load
    evaluateUserSession();

    // Event Listeners for switching auth modes
    tabLogin.addEventListener('click', () => {
        currentAuthMode = 'login';
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
        authSubmitBtn.innerText = 'ACCESS CORE';
    });

    tabSignup.addEventListener('click', () => {
        currentAuthMode = 'signup';
        tabSignup.classList.add('active');
        tabLogin.classList.remove('active');
        authSubmitBtn.innerText = 'CREATE IDENTITY';
    });

    // Submit credentials to secure Termux node server
    authSubmitBtn.addEventListener('click', executionAuthPipeline);
});

async function executionAuthPipeline() {
    const email = authEmail.value.trim();
    const pass = authPass.value.trim();

    if (!email || !pass) {
        alert('⚠️ Matrix Protection: Email aur Password blank nahi ho sakte!');
        return;
    }

    try {
        authSubmitBtn.innerText = 'TRANSMITTING DATA...';
        
        const response = await fetch(`${API_AUTH_URL}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, pass, mode: currentAuthMode })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Save inside browser's terminal local storage
            localStorage.setItem('neo_uid', data.uid);
            localStorage.setItem('neo_email', email);
            
            // Wipe inputs clean
            authEmail.value = '';
            authPass.value = '';
            
            // Refresh dynamic console layout
            evaluateUserSession();
            
            // Close sidebar panel if open (global function inside script.js)
            if (window.closeSidebarLayout) {
                window.closeSidebarLayout();
            }
        } else {
            alert(`🛑 Matrix Authorization Denied: ${data.error}`);
        }
    } catch (err) {
        console.error("Auth System dropped out:", err);
        alert('❌ Network Loop Interrupted: Backend server offline hai.');
    } finally {
        authSubmitBtn.innerText = currentAuthMode === 'login' ? 'ACCESS CORE' : 'CREATE IDENTITY';
    }
}

function evaluateUserSession() {
    const userUID = localStorage.getItem('neo_uid');
    const userEmail = localStorage.getItem('neo_email');

    if (userUID) {
        authSection.classList.add('hidden');
        profileSection.classList.remove('hidden');
        usernameDisplay.innerText = userEmail.toUpperCase().split('@')[0];
        connectionStatus.innerText = 'SECURE TIMELINE ACTIVE';
        connectionStatus.className = 'status-indicator secure-mode';
        
        // Trigger historical timeline refresh if ready
        if (window.fetchUserHistoryLogs) {
            window.fetchUserHistoryLogs();
        }
    } else {
        authSection.classList.remove('hidden');
        profileSection.classList.add('hidden');
        connectionStatus.innerText = 'GUEST MODE';
        connectionStatus.className = 'status-indicator guest-mode';
        historyBox.innerHTML = `<p class="empty-history-text">Login to sync cloud logs...</p>`;
    }
}

// Session Disconnect Action Exposed globally
document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('neo_uid');
    localStorage.removeItem('neo_email');
    evaluateUserSession();
};

// Global scope binding for sync calls
window.evaluateUserSession = evaluateUserSession;
