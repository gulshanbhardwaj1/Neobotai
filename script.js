/* ==========================================================
   🔒 INTEGRATED PRODUCTION ENGINES (Gemini & Firebase Active)
========================================================== */
const GEMINI_API_KEY = "AQ.Ab8RN6JFO-MGA9gUJWFA7bW-D4AI1TtImwLDdbt59DejgQKe8g"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCmzxEqJQLmFBbcXENyPYRA6C-fRVrBlTY",
  authDomain: "neobot-ai-3bb16.firebaseapp.com",
  databaseURL: "https://neobot-ai-3bb16-default-rtdb.firebaseio.com",
  projectId: "neobot-ai-3bb16",
  storageBucket: "neobot-ai-3bb16.firebasestorage.app",
  messagingSenderId: "542031139726",
  appId: "1:542031139726:web:6e180fe1693fa282d1ce79",
  measurementId: "G-7T6QL1M5G0"
};

// Initialize Production Stack
const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);
const provider    = new GoogleAuthProvider();

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

// 📁 Create Dynamically Handled Plus File Upload Trigger Nodes
const chatInputWrapper = document.querySelector(".chat-input-wrapper") || chatForm;
let fileInput = document.getElementById("hidden-file-input");
let filePreviewContainer = document.getElementById("file-preview-container");

if (!fileInput) {
  fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.id = "hidden-file-input";
  fileInput.accept = "image/*"; // Accepting images for Gemini Multimodal Analysis
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);
}

// Plus Button Setup
let plusBtn = document.getElementById("plus-file-btn");
if (!plusBtn) {
  plusBtn = document.createElement("button");
  plusBtn.type = "button";
  plusBtn.id = "plus-file-btn";
  plusBtn.className = "btn-icon";
  plusBtn.innerHTML = `<i class="fa-solid fa-plus" style="color: var(--neon-blue); font-size: 1.2rem; cursor: pointer; padding: 5px;"></i>`;
  chatInputWrapper.insertBefore(plusBtn, userInput);
}

if (!filePreviewContainer) {
  filePreviewContainer = document.createElement("div");
  filePreviewContainer.id = "file-preview-container";
  filePreviewContainer.style.cssText = "display: none; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 10px; align-items: center; gap: 10px; position: relative;";
  chatWindow.parentNode.insertBefore(filePreviewContainer, chatWindow.nextSibling);
}

/* ==========================================================
   STATE MANAGEMENT
========================================================== */
let currentUser = null;
let currentChatId = null; 
let conversationHistory = []; 
let isWaitingForResponse = false;
let selectedFileBase64 = null; // Stores temporary selected image string
let selectedFileType = null;

/* ==========================================================
   🔥 AUTHENTICATION TRACKER
========================================================== */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    loginScreen.classList.add("hidden");
    app.classList.remove("hidden");
    await loadUserChatListFromCloud();
    if (chatWindow.children.length === 0) {
      showWelcomeScreen();
    }
  } else {
    currentUser = null;
    currentChatId = null;
    conversationHistory = [];
    app.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    chatWindow.innerHTML = "";
    recentChatsList.innerHTML = "";
  }
});

googleLoginBtn.addEventListener("click", async () => {
  try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); }
});

logoutBtn.addEventListener("click", async () => {
  try { await signOut(auth); } catch (e) { console.error(e); }
});

/* ==========================================================
   📁 FILE UPLOAD HANDLERS (PLUS ATTACHMENT)
========================================================== */
plusBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  selectedFileType = file.type;
  const reader = new FileReader();
  reader.onload = function (event) {
    selectedFileBase64 = event.target.result.split(",")[1]; // Extract pure base64 text
    
    // UI Preview render line
    filePreviewContainer.innerHTML = `
      <img src="${event.target.result}" style="max-height: 50px; border-radius: 5px; border: 1px solid var(--neon-blue);"/>
      <span style="font-size: 0.8rem; color: var(--muted);">${file.name}</span>
      <i class="fa-solid fa-circle-xmark" id="clear-file-preview" style="color: var(--danger); cursor: pointer; position: absolute; right: 10px;"></i>
    `;
    filePreviewContainer.style.display = "flex";
  };
  reader.readAsDataURL(file);
});

// Clear Attachment Trigger
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "clear-file-preview") {
    clearAttachedFile();
  }
});

function clearAttachedFile() {
  selectedFileBase64 = null;
  selectedFileType = null;
  fileInput.value = "";
  filePreviewContainer.style.display = "none";
  filePreviewContainer.innerHTML = "";
}

/* ==========================================================
   SIDEBAR & UTILITIES
========================================================== */
function isMobileView() { return window.innerWidth <= 860; }

menuToggleBtn.addEventListener("click", () => {
  if (isMobileView()) {
    sidebar.classList.toggle("mobile-open");
    sidebarOverlay.classList.toggle("active");
  } else { sidebar.classList.toggle("collapsed"); }
});

sidebarOverlay.addEventListener("click", () => {
  sidebar.classList.remove("mobile-open");
  sidebarOverlay.classList.remove("active");
});

newChatBtn.addEventListener("click", () => {
  startNewChat();
  if (isMobileView()) {
    sidebar.classList.remove("mobile-open");
    sidebarOverlay.classList.remove("active");
  }
});

function startNewChat() {
  currentChatId = null;
  conversationHistory = [];
  chatWindow.innerHTML = "";
  clearAttachedFile();
  showWelcomeScreen();
  document.querySelectorAll(".chat-history-item").forEach(item => item.classList.remove("active"));
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
   ☁️ CLOUD FIRESTORE OPERATION HUB
========================================================== */
async function loadUserChatListFromCloud() {
  if (!currentUser) return;
  recentChatsList.innerHTML = "";
  try {
    const q = query(collection(db, "chats"), where("userId", "==", currentUser.uid), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((docSnap) => {
      createSidebarElement(docSnap.id, docSnap.data().title || "Untitled Chat");
    });
  } catch (err) { console.error(err); }
}

function createSidebarElement(chatId, titleText) {
  const item = document.createElement("div");
  item.classList.add("chat-history-item");
  if (chatId === currentChatId) item.classList.add("active");
  item.dataset.chatId = chatId;
  const trimmed = titleText.length > 28 ? titleText.slice(0, 28).trim() + "…" : titleText;
  item.innerHTML = `<i class="fa-regular fa-comment"></i><span>${escapeHTML(trimmed)}</span>`;

  item.addEventListener("click", async () => {
    if (isWaitingForResponse) return;
    document.querySelectorAll(".chat-history-item").forEach(el => el.classList.remove("active"));
    item.classList.add("active");
    currentChatId = chatId;
    await loadSpecificChatMessages(chatId);
  });
  recentChatsList.appendChild(item);
}

async function loadSpecificChatMessages(chatId) {
  const welcome = chatWindow.querySelector(".welcome-screen");
  if (welcome) welcome.remove();
  chatWindow.innerHTML = "";
  
  try {
    const docSnap = await getDoc(doc(db, "chats", chatId));
    if (docSnap.exists()) {
      conversationHistory = docSnap.data().messages || [];
      conversationHistory.forEach(msg => {
        if (msg.role === "user") {
          renderUserMessage(msg.text, msg.attachedImage);
        } else {
          renderAIMessage(msg.text);
        }
      });
    }
  } catch (e) { console.error(e); }
}

async function saveMessageToCloudChat(userPrompt, aiResponse, attachedImgBase64) {
  const newMessages = [
    ...conversationHistory,
    { role: "user", text: userPrompt, ...(attachedImgBase64 && { attachedImage: attachedImgBase64 }) },
    { role: "model", text: aiResponse }
  ];
  conversationHistory = newMessages;
  if (!currentUser) return;

  try {
    if (!currentChatId) {
      const docRef = await addDoc(collection(db, "chats"), {
        userId: currentUser.uid,
        title: userPrompt,
        timestamp: Date.now(),
        messages: newMessages
      });
      currentChatId = docRef.id;
      await loadUserChatListFromCloud();
    } else {
      await setDoc(doc(db, "chats", currentChatId), { messages: newMessages, timestamp: Date.now() }, { merge: true });
    }
  } catch (e) { console.error(e); }
}

/* ==========================================================
   MESSAGE UI ENGINE
========================================================== */
function renderUserMessage(text, attachedImgBase64) {
  const welcome = chatWindow.querySelector(".welcome-screen");
  if (welcome) welcome.remove();

  const row = document.createElement("div");
  row.classList.add("message-row", "user");
  
  let imgHtml = "";
  if (attachedImgBase64) {
    imgHtml = `<br/><img src="data:image/png;base64,${attachedImgBase64}" style="max-width: 200px; border-radius: 8px; margin-top: 5px; border: 1px solid rgba(255,255,255,0.1);"/>`;
  }

  row.innerHTML = `<div class="message-content">${escapeHTML(text)}${imgHtml}</div>`;
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
    <div class="message-content"><div class="thinking-dots"><span></span><span></span><span></span></div></div>
  `;
  chatWindow.appendChild(row);
  scrollToBottom();
}

function removeThinkingIndicator() {
  const row = document.getElementById("thinking-row");
  if (row) row.remove();
}

function scrollToBottom() { chatWindow.scrollTop = chatWindow.scrollHeight; }
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
function formatAIText(rawText) {
  let safe = escapeHTML(rawText);
  safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  safe = safe.replace(/\n\n/g, "</p><p>");
  safe = safe.replace(/\n/g, "<br>");
  return `<p>${safe}</p>`;
}

/* ==========================================================
   FORM SUBMISSION & AI TRIGGERS
========================================================== */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if ((!text && !selectedFileBase64) || isWaitingForResponse) return;

  userInput.value = "";
  const currentFile = selectedFileBase64; // Lock image locally
  
  renderUserMessage(text, currentFile);
  clearAttachedFile(); // Clear input state right away

  isWaitingForResponse = true;
  sendBtn.disabled = true;
  renderThinkingIndicator();

  try {
    const aiText = await fetchGeminiResponse(text, currentFile);
    removeThinkingIndicator();
    renderAIMessage(aiText);
    await saveMessageToCloudChat(text, aiText, currentFile);
  } catch (err) {
    removeThinkingIndicator();
    renderAIMessage(`⚠️ Error: ${err.message}`);
  } finally {
    isWaitingForResponse = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
});

/* ==========================================================
   GEMINI MULTIMODAL SYSTEM API INTEGRATION
========================================================== */
async function fetchGeminiResponse(promptText, attachedImgBase64) {
  const payload = { contents: [] };

  // Sync historical messages map structure
  conversationHistory.forEach(item => {
    payload.contents.push({
      role: item.role === "user" ? "user" : "model",
      parts: [{ text: item.text }]
    });
  });

  // Current new message payload node builder
  const newParts = [{ text: promptText || "Analyze this file architecture:" }];
  
  // If user clicks the plus button and attaches an image, include it in parts object
  if (attachedImgBase64) {
    newParts.push({
      inlineData: {
        mimeType: selectedFileType || "image/png",
        data: attachedImgBase64
      }
    });
  }

  payload.contents.push({ role: "user", parts: newParts });

  const response = await fetch(GEMINI_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error?.message || `HTTP error ${response.status}`);
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
}

window.addEventListener("resize", () => {
  if (!isMobileView()) {
    sidebar.classList.remove("mobile-open");
    sidebarOverlay.classList.remove("active");
  }
});
