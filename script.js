/* ==========================================================
   ⚠️ PASTE YOUR GEMINI API KEY HERE ⚠️
   Get one for free at: https://aistudio.google.com/app/apikey
========================================================== */
const GEMINI_API_KEY = "YOUR_API_KEY_HERE";

/* Gemini endpoint (v1beta, gemini-pro model) */
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;

/* ==========================================================
   DOM REFERENCES
========================================================== */
const loginScreen   = document.getElementById("login-screen");
const app           = document.getElementById("app");
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn     = document.getElementById("logout-btn");

const sidebar        = document.getElementById("sidebar");
const menuToggleBtn   = document.getElementById("menu-toggle-btn");
const sidebarOverlay  = document.getElementById("sidebar-overlay");
const newChatBtn      = document.getElementById("new-chat-btn");
const recentChatsList = document.getElementById("recent-chats");

const chatWindow = document.getElementById("chat-window");
const chatForm    = document.getElementById("chat-form");
const userInput   = document.getElementById("user-input");
const sendBtn     = document.getElementById("send-btn");

/* ==========================================================
   STATE
========================================================== */
let conversationHistory = [];   // { role: 'user' | 'model', text: string }
let isFirstMessageOfChat = true;
let isWaitingForResponse = false;
let chatIdCounter = 0;

/* ==========================================================
   AUTH: LOGIN / LOGOUT
========================================================== */
googleLoginBtn.addEventListener("click", () => {
  loginScreen.classList.add("hidden");
  app.classList.remove("hidden");
  if (chatWindow.children.length === 0) {
    showWelcomeScreen();
  }
});

logoutBtn.addEventListener("click", () => {
  app.classList.add("hidden");
  loginScreen.classList.remove("hidden");

  // Reset app state fully on logout
  conversationHistory = [];
  isFirstMessageOfChat = true;
  chatWindow.innerHTML = "";
  recentChatsList.innerHTML = "";
});

/* ==========================================================
   SIDEBAR TOGGLE
========================================================== */
function isMobileView() {
  return window.innerWidth <= 860;
}

menuToggleBtn.addEventListener("click", () => {
  if (isMobileView()) {
    sidebar.classList.toggle("mobile-open");
    sidebarOverlay.classList.toggle("active");
  } else {
    sidebar.classList.toggle("collapsed");
  }
});

sidebarOverlay.addEventListener("click", () => {
  sidebar.classList.remove("mobile-open");
  sidebarOverlay.classList.remove("active");
});

/* ==========================================================
   NEW CHAT
========================================================== */
newChatBtn.addEventListener("click", () => {
  startNewChat();
  if (isMobileView()) {
    sidebar.classList.remove("mobile-open");
    sidebarOverlay.classList.remove("active");
  }
});

function startNewChat() {
  conversationHistory = [];
  isFirstMessageOfChat = true;
  chatWindow.innerHTML = "";
  showWelcomeScreen();

  // Deselect any active chat history item
  document.querySelectorAll(".chat-history-item").forEach(item => {
    item.classList.remove("active");
  });
}

function showWelcomeScreen() {
  chatWindow.innerHTML = `
    <div class="welcome-screen">
      <i class="fa-solid fa-atom welcome-icon"></i>
      <h2>How can I help you today?</h2>
      <p>Ask me anything — I'm ready when you are.</p>
    </div>
  `;
}

/* ==========================================================
   RECENT CHATS SIDEBAR LIST
========================================================== */
function addRecentChatEntry(snippetText) {
  // Deselect previous active item
  document.querySelectorAll(".chat-history-item").forEach(item => {
    item.classList.remove("active");
  });

  const chatId = `chat-${++chatIdCounter}`;
  const item = document.createElement("div");
  item.classList.add("chat-history-item", "active");
  item.dataset.chatId = chatId;

  const trimmed = snippetText.length > 28
    ? snippetText.slice(0, 28).trim() + "…"
    : snippetText;

  item.innerHTML = `<i class="fa-regular fa-comment"></i><span>${escapeHTML(trimmed)}</span>`;

  item.addEventListener("click", () => {
    document.querySelectorAll(".chat-history-item").forEach(el => el.classList.remove("active"));
    item.classList.add("active");
    // Note: this demo does not persist/reload past conversations,
    // it simply marks the clicked item as active.
  });

  recentChatsList.prepend(item);
}

/* ==========================================================
   MESSAGE RENDERING
========================================================== */
function clearWelcomeScreenIfPresent() {
  const welcome = chatWindow.querySelector(".welcome-screen");
  if (welcome) welcome.remove();
}

function renderUserMessage(text) {
  clearWelcomeScreenIfPresent();

  const row = document.createElement("div");
  row.classList.add("message-row", "user");
  row.innerHTML = `
    <div class="message-content">${escapeHTML(text)}</div>
  `;
  chatWindow.appendChild(row);
  scrollToBottom();
}

function renderAIMessage(text) {
  const row = document.createElement("div");
  row.classList.add("message-row", "ai");
  row.innerHTML = `
    <div class="message-avatar"><i class="fa-solid fa-atom"></i></div>
    <div class="message-content">${formatAIText(text)}</div>
  `;
  chatWindow.appendChild(row);
  scrollToBottom();
}

function renderThinkingIndicator() {
  const row = document.createElement("div");
  row.classList.add("message-row", "ai");
  row.id = "thinking-row";
  row.innerHTML = `
    <div class="message-avatar"><i class="fa-solid fa-atom"></i></div>
    <div class="message-content">
      <div class="thinking-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  chatWindow.appendChild(row);
  scrollToBottom();
}

function removeThinkingIndicator() {
  const row = document.getElementById("thinking-row");
  if (row) row.remove();
}

function scrollToBottom() {
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Basic escaping to avoid HTML injection from user input */
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/* Very light formatting: turn **bold** and newlines into HTML,
   since Gemini often returns lightweight markdown-style text */
function formatAIText(rawText) {
  let safe = escapeHTML(rawText);
  safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/\n\n/g, "</p><p>");
  safe = safe.replace(/\n/g, "<br>");
  return `<p>${safe}</p>`;
}

/* ==========================================================
   FORM SUBMISSION / SEND MESSAGE
========================================================== */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = userInput.value.trim();
  if (!text || isWaitingForResponse) return;

  userInput.value = "";
  renderUserMessage(text);

  // Add first message of a new chat to the sidebar history
  if (isFirstMessageOfChat) {
    addRecentChatEntry(text);
    isFirstMessageOfChat = false;
  }

  conversationHistory.push({ role: "user", text });

  isWaitingForResponse = true;
  sendBtn.disabled = true;
  renderThinkingIndicator();

  try {
    const aiText = await fetchGeminiResponse(text);
    removeThinkingIndicator();
    renderAIMessage(aiText);
    conversationHistory.push({ role: "model", text: aiText });
  } catch (err) {
    removeThinkingIndicator();
    renderAIMessage(
      `⚠️ Sorry, something went wrong: ${err.message || "Unable to reach Gemini API."}`
    );
    console.error("Gemini API error:", err);
  } finally {
    isWaitingForResponse = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
});

/* ==========================================================
   GEMINI API INTEGRATION
========================================================== */
async function fetchGeminiResponse(promptText) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_API_KEY_HERE") {
    return "⚠️ No Gemini API key found. Please paste your API key into the `GEMINI_API_KEY` variable at the top of script.js to enable live responses.";
  }

  const payload = {
    contents: [
      {
        parts: [
          { text: promptText }
        ]
      }
    ]
  };

  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.error?.message || `HTTP error ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json();

  const aiText =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "I couldn't generate a response for that. Please try rephrasing.";

  return aiText;
}

/* ==========================================================
   INIT
========================================================== */
window.addEventListener("resize", () => {
  if (!isMobileView()) {
    sidebar.classList.remove("mobile-open");
    sidebarOverlay.classList.remove("active");
  }
});

// Show welcome screen if app is already visible on load (e.g. dev testing)
if (!app.classList.contains("hidden")) {
  showWelcomeScreen();
}
