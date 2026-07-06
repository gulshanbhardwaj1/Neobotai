/* ==========================================================
   
   ⚠️ PASTE YOUR GEMINI API KEY HERE ⚠️
   Get one for free at: https://aistudio.google.com/app/apikey
========================================================== */
const GEMINI_API_KEY = "AQ.Ab8RN6JFO-MGA9gUJWFA7bW-D4AI1TtImwLDdbt59DejgQKe8g"; // <--- Apni sahi key yahan dalo
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

/* ==========================================================
   🔥 FIREBASE CORE & FIRESTORE DATABASE CONFIG AREA
========================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCmzxEqJQLmFBbcXENyPYRA6C-fRVrBlTY",
  authDomain: "neobot-ai-3bb16.firebaseapp.com",
  databaseURL: "https://neobot-ai-3bb16-default-rtdb.firebaseio.com",
  projectId: "neobot-ai-3bb16",
  storageBucket: "neobot-ai-3bb16.firebasestorage.app",
  messagingSenderId: "687176512774",
  appId: "1:687176512774:web:81ca34c5eecac3c7419a87",
  measurementId: "G-46ER0702X7"
};

// Initialize Firebase & DB Services
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

/* ==========================================================
   STATE MANAGEMENT
========================================================== */
let currentUser = null;
let currentChatId = null; // Stores currently selected cloud chat document ID
let conversationHistory = []; 
let isWaitingForResponse = false;

/* ==========================================================
   🔥 AUTHENTICATION STATE TRACKER (Real-time Sync)
========================================================== */
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    loginScreen.classList.add("hidden");
    app.classList.remove("hidden");
    
    // Cloud database se is bande ki purani chat list lekar sidebar mein dikhana
    await loadUserChatListFromCloud();
    
    if (chatWindow.children.length === 0) {
      showWelcomeScreen();
    }
  } else {
    currentUser = null;
    currentChatId = null;
    app.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    chatWindow.innerHTML = "";
    recentChatsList.innerHTML = "";
  }
});

// Google Login Trigger
googleLoginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Login Trigger Failure:", error);
    alert("Google authentication failed.");
  }
});

// Logout Trigger
logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout Failure:", error);
  }
});

/* ==========================================================
   SIDEBAR & VIEWPORT LOGIC
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
   ☁️ CLOUD FIRESTORE DATA MANIPULATION
========================================================== */

// 1. Sidebar mein purani sari chats load karna
async function loadUserChatListFromCloud() {
  if (!currentUser) return;
  recentChatsList.innerHTML = "";
  
  try {
    const q = query(
      collection(db, "chats"),
      where("userId", "==", currentUser.uid),
      orderBy("timestamp", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((docSnap) => {
      const chatData = docSnap.data();
      createSidebarElement(docSnap.id, chatData.title || "Untitled Chat");
    });
  } catch (err) {
    console.error("Error loading chat list:", err);
  }
}

// 2. Sidebar item UI element banana aur click hone par cloud se messages pull karna
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
    
    // Specific chat select karke uske messages cloud se lana
    currentChatId = chatId;
    await loadSpecificChatMessages(chatId);
  });

  recentChatsList.appendChild(item);
}

// 3. Kisi specific chat par click karne par uske messages screen par display karna
async function loadSpecificChatMessages(chatId) {
  clearWelcomeScreenIfPresent();
  chatWindow.innerHTML = "";
  
  try {
    const docRef = doc(db, "chats", chatId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const chatData = docSnap.exists() ? docSnap.data() : { messages: [] };
      conversationHistory = chatData.messages || [];
      
      conversationHistory.forEach(msg => {
        if (msg.role === "user") {
          renderUserMessage(msg.text);
        } else {
          renderAIMessage(msg.text);
        }
      });
    }
  } catch (err) {
    console.error("Error fetching messages:", err);
  }
}

// 4. Naye message ko Firebase cloud database mein push/save karna
async function saveMessageToCloudChat(userPrompt, aiResponse) {
  if (!currentUser) return;

  const newMessages = [
    ...conversationHistory,
    { role: "user", text: userPrompt },
    { role: "model", text: aiResponse }
  ];

  try {
    if (!currentChatId) {
      // Agar ye bilkul naya chat session h toh database mein naya document insert karo
      const docRef = await addDoc(collection(db, "chats"), {
        userId: currentUser.uid,
        title: userPrompt,
        timestamp: Date.now(),
        messages: newMessages
      });
      currentChatId = docRef.id;
      // UI list refresh karein
      await loadUserChatListFromCloud();
    } else {
      // Agar chat pehle se save h toh usi document ID par messages array update kar do
      const docRef = doc(db, "chats", currentChatId);
      await addDoc(collection(db, "chats"), {
        messages: newMessages,
        timestamp: Date.now()
      }, { merge: true }); // Merge ensures other fields aren't deleted
    }
    
    // Local state array sync karein
    conversationHistory = newMessages;
  } catch (error) {
    console.error("Failed syncing chat tracking down to cloud storage:", error);
  }
}

/* ==========================================================
   MESSAGE RENDERING ENGINE
========================================================== */
function clearWelcomeScreenIfPresent() {
  const welcome = chatWindow.querySelector(".welcome-screen");
  if (welcome) welcome.remove();
}

function renderUserMessage(text) {
  clearWelcomeScreenIfPresent();
  const row = document.createElement("div");
  row.classList.add("message-row", "user");
  row.innerHTML = `<div class="message-content">${escapeHTML(text)}</div>`;
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
   FORM SUBMISSION
========================================================== */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = userInput.value.trim();
  if (!text || isWaitingForResponse) return;

  userInput.value = "";
  renderUserMessage(text);

  isWaitingForResponse = true;
  sendBtn.disabled = true;
  renderThinkingIndicator();

  try {
    // 1. Gemini AI response generate karega
    const aiText = await fetchGeminiResponse(text);
    removeThinkingIndicator();
    renderAIMessage(aiText);
    
    // 2. ⚡ FIREBASE CLOUD STREAM: Sync and lock chat directly inside user database profile
    await saveMessageToCloudChat(text, aiText);

  } catch (err) {
    removeThinkingIndicator();
    renderAIMessage(`⚠️ Error: ${err.message || "Unable to reach Gemini API."}`);
  } finally {
    isWaitingForResponse = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
});

/* ==========================================================
   GEMINI CONTEXT FETCH
========================================================== */
async function fetchGeminiResponse(promptText) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_LIVE_GEMINI_API_KEY_HERE") {
    return "⚠️ API Key Matrix missing.";
  }

  // Pure context history array ko payload structure mein convert karna
  const payload = {
    contents: conversationHistory.map(item => ({
      role: item.role === "user" ? "user" : "model",
      parts: [{ text: item.text }]
    }))
  };

  payload.contents.push({
    role: "user",
    parts: [{ text: promptText }]
  });

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
