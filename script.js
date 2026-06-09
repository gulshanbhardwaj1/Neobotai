// --- INTERFACE STRUCTURAL DOM MAPPING ---
const menuToggleBtn = document.getElementById('menu-toggle-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const sidebarPanel = document.getElementById('sidebar-panel');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const historyContainer = document.getElementById('history-box');

const API_CHAT_BASE = 'http://localhost:3000/api';

document.addEventListener('DOMContentLoaded', () => {
    // Synchronize current data structures on startup
    if (window.evaluateUserSession) {
        window.evaluateUserSession();
    }
    
    // Auto-grow configuration logic for chat text terminal
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Control triggers setup
    sendBtn.addEventListener('click', transmitUserDialogue);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            transmitUserDialogue();
        }
    });
});

// --- SIDE PANEL SLIDER ANIMATION INTERFACES ---
menuToggleBtn.addEventListener('click', () => {
    sidebarPanel.classList.add('open');
    sidebarOverlay.classList.add('active');
});

const closeSidebarLayout = () => {
    sidebarPanel.classList.remove('open');
    sidebarOverlay.classList.remove('active');
};
closeSidebarBtn.addEventListener('click', closeSidebarLayout);
sidebarOverlay.addEventListener('click', closeSidebarLayout);

// --- PIPELINE STREAM TRANSMISSION CONTROLLER ---
async function transmitUserDialogue() {
    const rawPrompt = userInput.value.trim();
    if (!rawPrompt) return;

    const sessionUID = localStorage.getItem('neo_uid');

    // Wipe textarea view setup
    userInput.value = '';
    userInput.style.height = 'auto';

    // Print client dialogue bubble token
    appendChatBubbleToken(rawPrompt, 'user-msg');

    try {
        // Render artificial intelligence parsing state trace
        const loadingTokenId = appendChatBubbleToken('[COMPILING MATRIX DATA STREAMS]...', 'bot-msg');
        
        const response = await fetch(`${API_CHAT_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                message: rawPrompt, 
                uid: sessionUID || "GUEST_USER_SESSION" // Strict Pro Logic: Login na ho to generic routing track
            })
        });
        
        const outputData = await response.json();
        
        // Clear calculation loader row
        document.getElementById(loadingTokenId).remove();

        if (outputData.reply) {
            appendChatBubbleToken(outputData.reply, 'bot-msg', true);
            
            // Sync log tracks down history pane if authenticated session exists
            if (sessionUID) {
                fetchUserHistoryLogs();
            }
        } else {
            appendChatBubbleToken('⚠️ Connection drop: Core returned null configurations.', 'bot-msg', true);
        }
    } catch (error) {
        console.error("AI Communication Failure:", error);
        appendChatBubbleToken('❌ Connection dropped: loopback host system offline.', 'bot-msg', true);
    }
}

// DOM Injection processing machine for chat nodes
function appendChatBubbleToken(content, alignmentStyleClass, isBotAgent = false) {
    const trackingId = 'token_' + Date.now() + Math.random().toString(36).substr(2, 4);
    const wrapperRow = document.createElement('div');
    wrapperRow.className = `message ${alignmentStyleClass}`;
    wrapperRow.id = trackingId;

    const contentBox = document.createElement('div');
    contentBox.className = 'msg-bubble';
    
    if (isBotAgent) {
        contentBox.innerHTML = `<span class="bot-tag">[NEOBOT]:</span> ${content}`;
    } else {
        contentBox.innerText = content;
    }

    wrapperRow.appendChild(contentBox);
    chatBox.appendChild(wrapperRow);
    
    // Smooth scrolling snap lock active
    chatBox.scrollTop = chatBox.scrollHeight;
    return trackingId;
}

// --- CLOUD TIMELINE LOG FETCH MECHANISM ---
async function fetchUserHistoryLogs() {
    const sessionUID = localStorage.getItem('neo_uid');
    if (!sessionUID) return;

    try {
        const response = await fetch(`${API_CHAT_BASE}/history?uid=${sessionUID}`);
        const data = await response.json();
        
        if (data.chats && data.chats.length > 0) {
            historyContainer.innerHTML = '';
            data.chats.forEach(logRow => {
                const legacyElement = document.createElement('div');
                legacyElement.className = 'history-item';
                legacyElement.innerText = logRow.user_message;
                legacyElement.title = logRow.user_message;
                historyContainer.appendChild(legacyElement);
            });
        } else {
            historyContainer.innerHTML = `<p class="empty-history-text">No timeline history recorded.</p>`;
        }
    } catch(err) {
        historyContainer.innerHTML = `<p class="empty-history-text" style="color: #ff0055;">Log synchronization dropped.</p>`;
    }
}

// Global hook allocations for multi-file interconnectivity
window.closeSidebarLayout = closeSidebarLayout;
window.fetchUserHistoryLogs = fetchUserHistoryLogs;
