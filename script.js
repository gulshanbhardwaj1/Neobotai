// --- INTERFACE STRUCTURAL DOM MAPPING ---

// Use relative API base so production over HTTPS will work with a proxied backend
const API_CHAT_BASE = '/api';

let menuToggleBtn, closeSidebarBtn, sidebarPanel, sidebarOverlay, chatBox, userInput, sendBtn, historyContainer;

document.addEventListener('DOMContentLoaded', () => {
    // Query DOM elements after they exist
    menuToggleBtn = document.getElementById('menu-toggle-btn');
    closeSidebarBtn = document.getElementById('close-sidebar-btn');
    sidebarPanel = document.getElementById('sidebar-panel');
    sidebarOverlay = document.getElementById('sidebar-overlay');
    chatBox = document.getElementById('chat-box');
    userInput = document.getElementById('user-input');
    sendBtn = document.getElementById('send-btn');
    historyContainer = document.getElementById('history-box');

    // Initialize auth system if present
    if (window.evaluateUserSession) window.evaluateUserSession();

    // Auto-grow textarea
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Submit handlers
    sendBtn.addEventListener('click', transmitUserDialogue);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            transmitUserDialogue();
        }
    });

    // Sidebar toggles
    if (menuToggleBtn) menuToggleBtn.addEventListener('click', openSidebarLayout);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebarLayout);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebarLayout);

    // Focus input on load for quick chat
    if (userInput) userInput.focus();
});

function openSidebarLayout() {
    if (!sidebarPanel || !sidebarOverlay) return;
    sidebarPanel.classList.add('open');
    sidebarPanel.setAttribute('aria-hidden', 'false');
    sidebarOverlay.hidden = false;
}

function closeSidebarLayout() {
    if (!sidebarPanel || !sidebarOverlay) return;
    sidebarPanel.classList.remove('open');
    sidebarPanel.setAttribute('aria-hidden', 'true');
    sidebarOverlay.hidden = true;
}

// Expose for other modules
window.openSidebarLayout = openSidebarLayout;
window.closeSidebarLayout = closeSidebarLayout;

// --- PIPELINE STREAM TRANSMISSION CONTROLLER ---
async function transmitUserDialogue() {
    if (!userInput) return;
    const rawPrompt = userInput.value.trim();
    if (!rawPrompt) return;

    const sessionUID = localStorage.getItem('neo_uid');

    // Wipe textarea view setup
    userInput.value = '';
    userInput.style.height = 'auto';

    // Print client dialogue bubble token
    appendChatBubbleToken(rawPrompt, 'user-msg');

    // Render loading token
    const loadingTokenId = appendChatBubbleToken('[COMPILING MATRIX DATA STREAMS]...', 'bot-msg');

    try {
        const response = await fetch(`${API_CHAT_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: rawPrompt, uid: sessionUID || 'GUEST_USER_SESSION' })
        });

        if (!response.ok) {
            throw new Error(`Server error ${response.status}`);
        }

        const outputData = await response.json();

        // Remove loading token if still present
        const loader = document.getElementById(loadingTokenId);
        if (loader) loader.remove();

        if (outputData && outputData.reply) {
            appendChatBubbleToken(outputData.reply, 'bot-msg', true);
            if (sessionUID && window.fetchUserHistoryLogs) {
                window.fetchUserHistoryLogs();
            }
        } else {
            appendChatBubbleToken('⚠️ Connection drop: Core returned null configurations.', 'bot-msg', true);
        }
    } catch (error) {
        console.error('AI Communication Failure:', error);
        // ensure loader removed
        const loader = document.getElementById(loadingTokenId);
        if (loader) loader.remove();
        appendChatBubbleToken('❌ Connection dropped: backend unavailable.', 'bot-msg', true);
    }
}

// DOM Injection processing machine for chat nodes (XSS-safe)
function appendChatBubbleToken(content, alignmentStyleClass, isBotAgent = false) {
    const trackingId = 'token_' + Date.now() + Math.random().toString(36).substr(2, 4);
    const wrapperRow = document.createElement('div');
    wrapperRow.className = `message ${alignmentStyleClass}`;
    wrapperRow.id = trackingId;

    const contentBox = document.createElement('div');
    contentBox.className = 'msg-bubble';

    if (isBotAgent) {
        const tag = document.createElement('span');
        tag.className = 'bot-tag';
        tag.textContent = '[NEOBOT]:';
        contentBox.appendChild(tag);
        // Add a space separator
        contentBox.appendChild(document.createTextNode(' ' + String(content)));
    } else {
        // user content as plain text
        contentBox.textContent = String(content);
    }

    wrapperRow.appendChild(contentBox);
    if (chatBox) chatBox.appendChild(wrapperRow);

    // Smooth scroll to bottom
    if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    return trackingId;
}

// --- CLOUD TIMELINE LOG FETCH MECHANISM ---
async function fetchUserHistoryLogs() {
    const sessionUID = localStorage.getItem('neo_uid');
    if (!sessionUID || !historyContainer) return;

    try {
        const response = await fetch(`${API_CHAT_BASE}/history?uid=${sessionUID}`);
        if (!response.ok) {
            throw new Error(`History fetch failed ${response.status}`);
        }
        const data = await response.json();

        if (data.chats && data.chats.length > 0) {
            historyContainer.innerHTML = '';
            data.chats.forEach(logRow => {
                const legacyElement = document.createElement('div');
                legacyElement.className = 'history-item';
                legacyElement.textContent = logRow.user_message;
                legacyElement.title = logRow.user_message;
                historyContainer.appendChild(legacyElement);
            });
        } else {
            historyContainer.innerHTML = `<p class="empty-history-text">No timeline history recorded.</p>`;
        }
    } catch (err) {
        historyContainer.innerHTML = `<p class="empty-history-text" style="color: #ff0055;">Log synchronization dropped.</p>`;
        console.error('History sync error', err);
    }
}

// Global hook allocations for multi-file interconnectivity
window.fetchUserHistoryLogs = fetchUserHistoryLogs;
