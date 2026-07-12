/* ==========================================================================
   GLAMOUR AI — Application Logic
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   0. CONFIG — replace with your real keys
   -------------------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

/* --------------------------------------------------------------------------
   1. FIREBASE INIT (guarded — app still runs locally if keys are placeholders)
   -------------------------------------------------------------------------- */
let firebaseReady = false;
let auth = null;
let db = null;

try {
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    firebaseReady = true;
  } else {
    console.warn("[Glamour AI] Firebase keys are placeholders. Running in local-only mode.");
  }
} catch (err) {
  console.error("[Glamour AI] Firebase init failed:", err);
}

/* --------------------------------------------------------------------------
   2. STATE
   -------------------------------------------------------------------------- */
const state = {
  user: null,              // { uid, name, email }
  chats: {},               // id -> { id, title, messages: [], updatedAt }
  activeChatId: null,
  knowledgeBase: '',
  theme: 'dark',
  sidebarCollapsed: false,
  pendingFiles: [],        // files attached to the next outgoing message
  isGenerating: false,
  abortGeneration: false,
  confirmCallback: null,
  renameTargetId: null,
};

const LOCAL_KEYS = {
  chats: (uid) => `glamour_chats_${uid}`,
  knowledge: (uid) => `glamour_knowledge_${uid}`,
  theme: 'glamour_theme',
  sidebar: 'glamour_sidebar_collapsed',
  draft: 'glamour_draft',
  localUser: 'glamour_local_user', // fallback auth when Firebase isn't configured
};

/* --------------------------------------------------------------------------
   3. DOM SHORTCUTS
   -------------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

const el = {
  loader: $('app-loader'),
  authScreen: $('auth-screen'),
  appShell: $('app-shell'),

  loginForm: $('login-form'),
  signupForm: $('signup-form'),
  forgotForm: $('forgot-form'),
  authMessage: $('auth-message'),

  sidebar: $('sidebar'),
  sidebarOverlay: $('sidebar-overlay'),
  chatHistoryList: $('chat-history-list'),
  chatSearch: $('chat-search'),
  userAvatar: $('user-avatar'),
  userName: $('user-name'),
  userEmail: $('user-email'),

  chatTitleDisplay: $('chat-title-display'),
  messagesContainer: $('messages-container'),
  emptyState: $('empty-state'),
  messagesList: $('messages-list'),
  scrollBottomBtn: $('scroll-bottom-btn'),

  filePreviewRow: $('file-preview-row'),
  dropZone: $('drop-zone'),
  fileInput: $('file-input'),
  chatInput: $('chat-input'),
  sendBtn: $('send-btn'),
  stopBtn: $('stop-btn'),
  charCounter: $('char-counter'),
  micBtn: $('mic-btn'),

  knowledgeModal: $('knowledge-modal'),
  knowledgeTextarea: $('knowledge-textarea'),
  knowledgeStatus: $('knowledge-status'),

  settingsModal: $('settings-modal'),
  renameModal: $('rename-modal'),
  renameInput: $('rename-input'),
  confirmModal: $('confirm-modal'),
  confirmTitle: $('confirm-title'),
  confirmMessage: $('confirm-message'),

  toastContainer: $('toast-container'),
};

/* --------------------------------------------------------------------------
   4. UTILITIES
   -------------------------------------------------------------------------- */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type = 'info') {
  const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('exit');
    setTimeout(() => toast.remove(), 260);
  }, 3400);
}

function openModal(modalEl) { modalEl.classList.remove('hidden'); }
function closeModal(modalEl) { modalEl.classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal($(btn.dataset.close)));
});
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay); });
});

// Ripple effect for any .ripple element
document.addEventListener('click', (e) => {
  const target = e.target.closest('.ripple');
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const circle = document.createElement('span');
  const size = Math.max(rect.width, rect.height);
  circle.className = 'ripple-circle';
  circle.style.width = circle.style.height = `${size}px`;
  circle.style.left = `${e.clientX - rect.left - size / 2}px`;
  circle.style.top = `${e.clientY - rect.top - size / 2}px`;
  target.appendChild(circle);
  setTimeout(() => circle.remove(), 620);
});

function confirmAction(title, message, onConfirm) {
  el.confirmTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(title)}`;
  el.confirmMessage.textContent = message;
  state.confirmCallback = onConfirm;
  openModal(el.confirmModal);
}
$('confirm-cancel-btn').addEventListener('click', () => closeModal(el.confirmModal));
$('confirm-ok-btn').addEventListener('click', () => {
  if (state.confirmCallback) state.confirmCallback();
  closeModal(el.confirmModal);
});

/* --------------------------------------------------------------------------
   5. THEME
   -------------------------------------------------------------------------- */
function applyTheme(theme) {
  state.theme = theme;
  localStorage.setItem(LOCAL_KEYS.theme, theme);
  let resolved = theme;
  if (theme === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', resolved);
  const icon = $('theme-toggle-btn').querySelector('i');
  icon.className = resolved === 'light' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  document.querySelectorAll('.theme-option').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

$('theme-toggle-btn').addEventListener('click', () => {
  applyTheme(state.theme === 'light' ? 'dark' : (state.theme === 'dark' ? 'system' : 'light'));
  persistUserSettings();
});

document.querySelectorAll('.theme-option').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyTheme(btn.dataset.theme);
    persistUserSettings();
  });
});

/* --------------------------------------------------------------------------
   6. SIDEBAR
   -------------------------------------------------------------------------- */
function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = collapsed;
  el.sidebar.classList.toggle('collapsed', collapsed);
  localStorage.setItem(LOCAL_KEYS.sidebar, collapsed ? '1' : '0');
}

$('sidebar-collapse-btn').addEventListener('click', () => setSidebarCollapsed(!state.sidebarCollapsed));
$('sidebar-open-btn').addEventListener('click', () => {
  el.sidebar.classList.remove('collapsed');
  el.sidebarOverlay.classList.add('show');
});
el.sidebarOverlay.addEventListener('click', () => {
  el.sidebar.classList.add('collapsed');
  el.sidebarOverlay.classList.remove('show');
});

/* --------------------------------------------------------------------------
   7. AUTH — FORM SWITCHING
   -------------------------------------------------------------------------- */
function showAuthForm(which) {
  [el.loginForm, el.signupForm, el.forgotForm].forEach((f) => f.classList.add('hidden'));
  el.authMessage.classList.add('hidden');
  if (which === 'login') el.loginForm.classList.remove('hidden');
  if (which === 'signup') el.signupForm.classList.remove('hidden');
  if (which === 'forgot') el.forgotForm.classList.remove('hidden');
}
$('show-forgot').addEventListener('click', () => showAuthForm('forgot'));
$('show-signup').addEventListener('click', () => showAuthForm('signup'));
$('show-login-from-signup').addEventListener('click', () => showAuthForm('login'));
$('show-login-from-forgot').addEventListener('click', () => showAuthForm('login'));

function authMessage(msg, type = 'error') {
  el.authMessage.textContent = msg;
  el.authMessage.className = `auth-message ${type === 'success' ? 'success' : ''}`;
  el.authMessage.classList.remove('hidden');
}

/* --------------------------------------------------------------------------
   8. AUTH — HANDLERS
   -------------------------------------------------------------------------- */
el.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  const remember = $('remember-me').checked;

  if (!firebaseReady) {
    // Local-only fallback so the UI is fully testable without real Firebase keys.
    return localFallbackLogin(email);
  }

  try {
    await auth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    authMessage(friendlyAuthError(err));
  }
});

el.signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('signup-name').value.trim();
  const email = $('signup-email').value.trim();
  const password = $('signup-password').value;

  if (!firebaseReady) return localFallbackLogin(email, name);

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    showToast('Account created — welcome to Glamour AI', 'success');
  } catch (err) {
    authMessage(friendlyAuthError(err));
  }
});

el.forgotForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('forgot-email').value.trim();
  if (!firebaseReady) {
    authMessage('Password reset requires Firebase to be configured with real keys.', 'error');
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    authMessage('Reset link sent. Check your inbox.', 'success');
  } catch (err) {
    authMessage(friendlyAuthError(err));
  }
});

$('google-login').addEventListener('click', async () => {
  if (!firebaseReady) {
    authMessage('Google sign-in requires Firebase to be configured with real keys.', 'error');
    return;
  }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
  } catch (err) {
    authMessage(friendlyAuthError(err));
  }
});

$('logout-btn').addEventListener('click', () => {
  confirmAction('Log out?', 'You can sign back in any time — your chats stay saved.', async () => {
    if (firebaseReady && auth.currentUser) {
      await auth.signOut();
    } else {
      localStorage.removeItem(LOCAL_KEYS.localUser);
      onSignedOut();
    }
  });
});

$('delete-account-btn').addEventListener('click', () => {
  confirmAction('Delete account?', 'This permanently deletes your account and all chat history. This cannot be undone.', async () => {
    try {
      if (firebaseReady && auth.currentUser) {
        const uidVal = auth.currentUser.uid;
        if (db) {
          const chatsSnap = await db.collection('users').doc(uidVal).collection('chats').get();
          const batch = db.batch();
          chatsSnap.forEach((doc) => batch.delete(doc.ref));
          batch.delete(db.collection('users').doc(uidVal));
          await batch.commit();
        }
        await auth.currentUser.delete();
      }
      localStorage.removeItem(LOCAL_KEYS.localUser);
      if (state.user) {
        localStorage.removeItem(LOCAL_KEYS.chats(state.user.uid));
        localStorage.removeItem(LOCAL_KEYS.knowledge(state.user.uid));
      }
      showToast('Account deleted', 'success');
      onSignedOut();
    } catch (err) {
      showToast(err.message || 'Could not delete account. Try signing in again first.', 'error');
    }
    closeModal(el.settingsModal);
  });
});

function friendlyAuthError(err) {
  const map = {
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password. Try again.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
  };
  return map[err.code] || err.message || 'Something went wrong. Please try again.';
}

// Local-only auth fallback (used only when Firebase placeholders are not replaced)
function localFallbackLogin(email, name) {
  if (!email) return authMessage('Enter a valid email.');
  const localUser = {
    uid: 'local_' + btoa(unescape(encodeURIComponent(email))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24),
    email,
    name: name || email.split('@')[0],
  };
  localStorage.setItem(LOCAL_KEYS.localUser, JSON.stringify(localUser));
  onSignedIn(localUser);
}

/* --------------------------------------------------------------------------
   9. AUTH STATE / SESSION BOOTSTRAP
   -------------------------------------------------------------------------- */
function onSignedIn(userObj) {
  state.user = userObj;
  el.userName.textContent = userObj.name || 'User';
  el.userEmail.textContent = userObj.email || '';
  el.userAvatar.textContent = (userObj.name || userObj.email || 'U').charAt(0).toUpperCase();

  el.authScreen.classList.add('hidden');
  el.appShell.classList.remove('hidden');

  loadUserData();
}

function onSignedOut() {
  state.user = null;
  state.chats = {};
  state.activeChatId = null;
  el.appShell.classList.add('hidden');
  el.authScreen.classList.remove('hidden');
  showAuthForm('login');
  el.loginForm.reset();
}

if (firebaseReady) {
  auth.onAuthStateChanged((user) => {
    finishLoaderOnce();
    if (user) {
      onSignedIn({ uid: user.uid, name: user.displayName || (user.email || '').split('@')[0], email: user.email });
    } else {
      onSignedOut();
    }
  });
} else {
  // local-only bootstrap
  setTimeout(() => {
    finishLoaderOnce();
    const saved = localStorage.getItem(LOCAL_KEYS.localUser);
    if (saved) {
      onSignedIn(JSON.parse(saved));
    } else {
      onSignedOut();
    }
  }, 500);
}

function finishLoaderOnce() {
  el.loader.classList.add('fade-out');
  setTimeout(() => el.loader.style.display = 'none', 550);
}

/* --------------------------------------------------------------------------
   10. DATA LOAD / SYNC (Firestore when available, else localStorage)
   -------------------------------------------------------------------------- */
async function loadUserData() {
  // Theme + sidebar are device-local by design
  applyTheme(localStorage.getItem(LOCAL_KEYS.theme) || 'dark');
  setSidebarCollapsed(localStorage.getItem(LOCAL_KEYS.sidebar) === '1');

  if (firebaseReady && db && !state.user.uid.startsWith('local_')) {
    try {
      const userDoc = await db.collection('users').doc(state.user.uid).get();
      state.knowledgeBase = (userDoc.exists && userDoc.data().knowledgeBase) || '';
      el.knowledgeTextarea.value = state.knowledgeBase;

      db.collection('users').doc(state.user.uid).collection('chats')
        .orderBy('updatedAt', 'desc')
        .onSnapshot((snap) => {
          state.chats = {};
          snap.forEach((doc) => { state.chats[doc.id] = { id: doc.id, ...doc.data() }; });
          renderChatHistory();
          if (!state.activeChatId && Object.keys(state.chats).length) {
            openChat(Object.keys(state.chats)[0]);
          } else if (!Object.keys(state.chats).length) {
            startNewChat();
          }
        }, (err) => console.error('Firestore sync error:', err));
    } catch (err) {
      console.error('Failed to load Firestore data, falling back to local:', err);
      loadLocalChats();
    }
  } else {
    state.knowledgeBase = localStorage.getItem(LOCAL_KEYS.knowledge(state.user.uid)) || '';
    el.knowledgeTextarea.value = state.knowledgeBase;
    loadLocalChats();
  }

  // Restore draft
  const draft = localStorage.getItem(LOCAL_KEYS.draft);
  if (draft) { el.chatInput.value = draft; autoResizeInput(); updateCharCounter(); }
}

function loadLocalChats() {
  const raw = localStorage.getItem(LOCAL_KEYS.chats(state.user.uid));
  state.chats = raw ? JSON.parse(raw) : {};
  renderChatHistory();
  const ids = Object.keys(state.chats);
  if (ids.length) {
    ids.sort((a, b) => (state.chats[b].updatedAt || 0) - (state.chats[a].updatedAt || 0));
    openChat(ids[0]);
  } else {
    startNewChat();
  }
}

function persistChats() {
  if (!state.user) return;
  if (firebaseReady && db && !state.user.uid.startsWith('local_')) {
    // Firestore writes happen per-chat in saveChat(); nothing global to do here.
    return;
  }
  localStorage.setItem(LOCAL_KEYS.chats(state.user.uid), JSON.stringify(state.chats));
}

function saveChat(chat) {
  chat.updatedAt = Date.now();
  state.chats[chat.id] = chat;
  if (firebaseReady && db && state.user && !state.user.uid.startsWith('local_')) {
    db.collection('users').doc(state.user.uid).collection('chats').doc(chat.id).set(chat)
      .catch((err) => console.error('Failed saving chat to Firestore:', err));
  } else {
    persistChats();
  }
  renderChatHistory();
}

function persistUserSettings() {
  if (!state.user) return;
  if (firebaseReady && db && !state.user.uid.startsWith('local_')) {
    db.collection('users').doc(state.user.uid).set({ theme: state.theme }, { merge: true }).catch(() => {});
  }
}

/* --------------------------------------------------------------------------
   11. KNOWLEDGE BASE MODAL
   -------------------------------------------------------------------------- */
$('knowledge-btn').addEventListener('click', () => {
  el.knowledgeTextarea.value = state.knowledgeBase;
  el.knowledgeStatus.textContent = '';
  openModal(el.knowledgeModal);
});

$('knowledge-save-btn').addEventListener('click', async () => {
  state.knowledgeBase = el.knowledgeTextarea.value;
  if (firebaseReady && db && state.user && !state.user.uid.startsWith('local_')) {
    try {
      await db.collection('users').doc(state.user.uid).set({ knowledgeBase: state.knowledgeBase }, { merge: true });
    } catch (err) {
      console.error(err);
    }
  } else if (state.user) {
    localStorage.setItem(LOCAL_KEYS.knowledge(state.user.uid), state.knowledgeBase);
  }
  el.knowledgeStatus.textContent = 'Saved ✓';
  showToast('Knowledge base saved', 'success');
  setTimeout(() => { el.knowledgeStatus.textContent = ''; }, 2200);
});

/* --------------------------------------------------------------------------
   12. SETTINGS MODAL
   -------------------------------------------------------------------------- */
$('settings-btn').addEventListener('click', () => openModal(el.settingsModal));

$('clear-chat-btn').addEventListener('click', () => {
  confirmAction('Clear this chat?', 'All messages in the current conversation will be removed.', () => {
    const chat = state.chats[state.activeChatId];
    if (chat) {
      chat.messages = [];
      saveChat(chat);
      renderMessages();
    }
    closeModal(el.settingsModal);
  });
});

$('export-chat-btn').addEventListener('click', () => {
  const chat = state.chats[state.activeChatId];
  if (!chat) return showToast('No chat to export', 'error');
  const blob = new Blob([JSON.stringify(chat, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(chat.title || 'glamour-chat').replace(/\s+/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Chat exported', 'success');
});

$('import-chat-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = JSON.parse(text);
    const chat = {
      id: uid(),
      title: imported.title ? `${imported.title} (imported)` : 'Imported chat',
      messages: Array.isArray(imported.messages) ? imported.messages : [],
      updatedAt: Date.now(),
    };
    saveChat(chat);
    openChat(chat.id);
    showToast('Chat imported', 'success');
  } catch (err) {
    showToast('Could not read that file — is it a valid Glamour AI export?', 'error');
  }
  e.target.value = '';
});

/* --------------------------------------------------------------------------
   13. CHAT LIST / HISTORY
   -------------------------------------------------------------------------- */
function renderChatHistory(filter = '') {
  const ids = Object.keys(state.chats).sort((a, b) => (state.chats[b].updatedAt || 0) - (state.chats[a].updatedAt || 0));
  const filtered = filter
    ? ids.filter((id) => (state.chats[id].title || '').toLowerCase().includes(filter.toLowerCase()))
    : ids;

  el.chatHistoryList.innerHTML = '';
  if (!filtered.length) {
    el.chatHistoryList.innerHTML = `<div class="chat-history-empty">${filter ? 'No chats match your search' : 'No chats yet'}</div>`;
    return;
  }

  filtered.forEach((id) => {
    const chat = state.chats[id];
    const item = document.createElement('div');
    item.className = `chat-history-item ${id === state.activeChatId ? 'active' : ''}`;
    item.innerHTML = `
      <span class="chat-item-title">${escapeHtml(chat.title || 'New chat')}</span>
      <span class="chat-item-actions">
        <button class="rename-chat-btn" title="Rename"><i class="fa-solid fa-pen"></i></button>
        <button class="delete-chat-btn" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </span>`;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.chat-item-actions')) return;
      openChat(id);
      if (window.innerWidth <= 860) { el.sidebar.classList.add('collapsed'); el.sidebarOverlay.classList.remove('show'); }
    });
    item.querySelector('.rename-chat-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      state.renameTargetId = id;
      el.renameInput.value = chat.title || '';
      openModal(el.renameModal);
      setTimeout(() => el.renameInput.focus(), 80);
    });
    item.querySelector('.delete-chat-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmAction('Delete chat?', `"${chat.title || 'New chat'}" will be permanently deleted.`, () => deleteChat(id));
    });
    el.chatHistoryList.appendChild(item);
  });
}

el.chatSearch.addEventListener('input', () => renderChatHistory(el.chatSearch.value));

$('rename-confirm-btn').addEventListener('click', () => {
  const chat = state.chats[state.renameTargetId];
  if (chat) {
    chat.title = el.renameInput.value.trim() || 'New chat';
    saveChat(chat);
    if (chat.id === state.activeChatId) el.chatTitleDisplay.textContent = chat.title;
  }
  closeModal(el.renameModal);
});
el.renameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('rename-confirm-btn').click(); });

function deleteChat(id) {
  delete state.chats[id];
  if (firebaseReady && db && state.user && !state.user.uid.startsWith('local_')) {
    db.collection('users').doc(state.user.uid).collection('chats').doc(id).delete().catch(() => {});
  } else {
    persistChats();
  }
  renderChatHistory();
  if (state.activeChatId === id) {
    const remaining = Object.keys(state.chats);
    if (remaining.length) openChat(remaining[0]); else startNewChat();
  }
}

function startNewChat() {
  const chat = { id: uid(), title: 'New chat', messages: [], updatedAt: Date.now() };
  state.chats[chat.id] = chat;
  saveChat(chat);
  openChat(chat.id);
}
$('new-chat-btn').addEventListener('click', () => {
  startNewChat();
  if (window.innerWidth <= 860) { el.sidebar.classList.add('collapsed'); el.sidebarOverlay.classList.remove('show'); }
});

function openChat(id) {
  state.activeChatId = id;
  const chat = state.chats[id];
  el.chatTitleDisplay.textContent = chat ? (chat.title || 'New chat') : 'New conversation';
  renderChatHistory(el.chatSearch.value);
  renderMessages();
}

/* --------------------------------------------------------------------------
   14. MESSAGE RENDERING
   -------------------------------------------------------------------------- */
marked.setOptions({
  breaks: true,
  gfm: true,
  highlight: null, // handled manually below for copy buttons
});

function renderMarkdown(raw) {
  const rawHtml = marked.parse(raw || '');
  const clean = DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['target'] });
  const wrapper = document.createElement('div');
  wrapper.innerHTML = clean;

  wrapper.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
    const pre = block.parentElement;
    const lang = (block.className.match(/language-(\w+)/) || [, 'text'])[1];
    const wrap = document.createElement('div');
    wrap.className = 'code-block-wrap';
    const header = document.createElement('div');
    header.className = 'code-block-header';
    header.innerHTML = `<span>${escapeHtml(lang)}</span><button class="code-copy-btn"><i class="fa-regular fa-copy"></i><span>Copy</span></button>`;
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(header);
    wrap.appendChild(pre);
    header.querySelector('.code-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(block.textContent).then(() => showToast('Code copied', 'success'));
    });
  });

  wrapper.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
  return wrapper.innerHTML;
}

function renderMessages() {
  const chat = state.chats[state.activeChatId];
  el.messagesList.innerHTML = '';
  if (!chat || !chat.messages.length) {
    el.emptyState.classList.remove('hidden');
    return;
  }
  el.emptyState.classList.add('hidden');
  chat.messages.forEach((msg) => el.messagesList.appendChild(buildMessageRow(msg)));
  scrollToBottom(true);
}

function buildMessageRow(msg) {
  const row = document.createElement('div');
  row.className = `message-row ${msg.role}`;
  row.dataset.id = msg.id;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = msg.role === 'user' ? (state.user?.name?.charAt(0).toUpperCase() || 'U') : 'G';

  const col = document.createElement('div');
  col.className = 'msg-col';

  const filesHtml = (msg.files && msg.files.length) ? buildFilesHtml(msg.files) : '';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  if (filesHtml) {
    const filesDiv = document.createElement('div');
    filesDiv.className = 'msg-files';
    filesDiv.style.marginBottom = '8px';
    filesDiv.innerHTML = filesHtml;
    col.appendChild(filesDiv);
  }
  if (msg.role === 'assistant' && msg.pending) {
    bubble.innerHTML = `<div class="thinking-dots"><span></span><span></span><span></span></div>`;
  } else {
    bubble.innerHTML = msg.role === 'assistant' ? renderMarkdown(msg.content) : escapeHtml(msg.content).replace(/\n/g, '<br>');
  }
  col.appendChild(bubble);

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  const metaSpans = [`<span>${formatTime(msg.timestamp || Date.now())}</span>`];
  meta.innerHTML = metaSpans.join('');

  if (!msg.pending) {
    const actions = document.createElement('span');
    actions.className = 'msg-actions';
    if (msg.role === 'assistant') {
      actions.innerHTML = `
        <button class="copy-msg-btn" title="Copy"><i class="fa-regular fa-copy"></i></button>
        <button class="regen-msg-btn" title="Regenerate"><i class="fa-solid fa-rotate-right"></i></button>`;
    } else {
      actions.innerHTML = `<button class="copy-msg-btn" title="Copy"><i class="fa-regular fa-copy"></i></button>`;
    }
    meta.appendChild(actions);

    actions.querySelector('.copy-msg-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(msg.content).then(() => showToast('Copied to clipboard', 'success'));
    });
    const regenBtn = actions.querySelector('.regen-msg-btn');
    if (regenBtn) regenBtn.addEventListener('click', () => regenerateFrom(msg.id));
  }

  row.appendChild(avatar);
  row.appendChild(col);
  col.appendChild(meta);
  return row;
}

function buildFilesHtml(files) {
  return files.map((f) => {
    if (f.type.startsWith('image/') && f.dataUrl) {
      return `<span class="msg-file-chip"><img src="${f.dataUrl}" alt="${escapeHtml(f.name)}" />${escapeHtml(f.name)}</span>`;
    }
    const icon = fileIconFor(f.type, f.name);
    return `<span class="msg-file-chip"><i class="fa-solid ${icon}"></i>${escapeHtml(f.name)}</span>`;
  }).join('');
}

function fileIconFor(type, name) {
  if (type.startsWith('image/')) return 'fa-image';
  if (type.startsWith('audio/')) return 'fa-file-audio';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'fa-file-pdf';
  if (name.endsWith('.docx')) return 'fa-file-word';
  if (type === 'text/plain' || name.endsWith('.txt')) return 'fa-file-lines';
  return 'fa-file';
}

function scrollToBottom(force = false) {
  const c = el.messagesContainer;
  const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 160;
  if (force || nearBottom) c.scrollTop = c.scrollHeight;
}
el.messagesContainer.addEventListener('scroll', () => {
  const c = el.messagesContainer;
  const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 160;
  el.scrollBottomBtn.classList.toggle('hidden', nearBottom);
});
el.scrollBottomBtn.addEventListener('click', () => scrollToBottom(true));

/* --------------------------------------------------------------------------
   15. COMPOSER — input, char count, autoresize
   -------------------------------------------------------------------------- */
function autoResizeInput() {
  el.chatInput.style.height = 'auto';
  el.chatInput.style.height = Math.min(el.chatInput.scrollHeight, 200) + 'px';
}
function updateCharCounter() {
  el.charCounter.textContent = `${el.chatInput.value.length} / 4000`;
}
el.chatInput.addEventListener('input', () => {
  autoResizeInput();
  updateCharCounter();
  localStorage.setItem(LOCAL_KEYS.draft, el.chatInput.value);
  el.sendBtn.disabled = !el.chatInput.value.trim() && !state.pendingFiles.length;
});
el.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});
el.sendBtn.disabled = true;

/* --------------------------------------------------------------------------
   16. FILE UPLOAD (attach, preview, drag & drop)
   -------------------------------------------------------------------------- */
$('upload-btn').addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', (e) => handleFilesAdded(e.target.files));

['dragenter', 'dragover'].forEach((evt) => {
  el.dropZone.addEventListener(evt, (e) => { e.preventDefault(); el.dropZone.classList.add('drag-active'); });
});
['dragleave', 'drop'].forEach((evt) => {
  el.dropZone.addEventListener(evt, (e) => { e.preventDefault(); el.dropZone.classList.remove('drag-active'); });
});
el.dropZone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files.length) handleFilesAdded(e.dataTransfer.files);
});

function handleFilesAdded(fileList) {
  Array.from(fileList).forEach((file) => {
    if (file.size > 12 * 1024 * 1024) {
      showToast(`${file.name} is over the 12MB limit`, 'error');
      return;
    }
    const entry = { id: uid(), name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl: null };
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => { entry.dataUrl = reader.result; renderFilePreviews(); };
      reader.readAsDataURL(file);
    }
    state.pendingFiles.push(entry);
  });
  renderFilePreviews();
  el.sendBtn.disabled = !el.chatInput.value.trim() && !state.pendingFiles.length;
  el.fileInput.value = '';
}

function renderFilePreviews() {
  if (!state.pendingFiles.length) {
    el.filePreviewRow.classList.add('hidden');
    el.filePreviewRow.innerHTML = '';
    return;
  }
  el.filePreviewRow.classList.remove('hidden');
  el.filePreviewRow.innerHTML = state.pendingFiles.map((f) => `
    <span class="file-preview-chip" data-id="${f.id}">
      ${f.dataUrl ? `<img src="${f.dataUrl}" alt="${escapeHtml(f.name)}" />` : `<span class="file-icon-box"><i class="fa-solid ${fileIconFor(f.type, f.name)}"></i></span>`}
      <span>${escapeHtml(f.name.length > 22 ? f.name.slice(0, 19) + '…' : f.name)}</span>
      <span class="remove-file"><i class="fa-solid fa-xmark"></i></span>
    </span>`).join('');

  el.filePreviewRow.querySelectorAll('.remove-file').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chip = btn.closest('.file-preview-chip');
      state.pendingFiles = state.pendingFiles.filter((f) => f.id !== chip.dataset.id);
      renderFilePreviews();
      el.sendBtn.disabled = !el.chatInput.value.trim() && !state.pendingFiles.length;
    });
  });
}

/* --------------------------------------------------------------------------
   17. VOICE INPUT (Web Speech API)
   -------------------------------------------------------------------------- */
let recognition = null;
let isListening = false;
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognitionAPI) {
  recognition = new SpeechRecognitionAPI();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (e) => {
    let transcript = '';
    for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
    el.chatInput.value = transcript;
    autoResizeInput();
    updateCharCounter();
  };
  recognition.onend = () => {
    isListening = false;
    el.micBtn.classList.remove('active');
    el.sendBtn.disabled = !el.chatInput.value.trim() && !state.pendingFiles.length;
  };
  recognition.onerror = () => {
    isListening = false;
    el.micBtn.classList.remove('active');
    showToast('Voice input error — check microphone permissions', 'error');
  };
}

el.micBtn.addEventListener('click', () => {
  if (!recognition) return showToast('Voice input isn\'t supported in this browser', 'error');
  if (isListening) {
    recognition.stop();
  } else {
    isListening = true;
    el.micBtn.classList.add('active');
    recognition.start();
  }
});

/* --------------------------------------------------------------------------
   18. SEND / RECEIVE MESSAGES + GEMINI API
   -------------------------------------------------------------------------- */
document.querySelectorAll('.suggestion-card').forEach((card) => {
  card.addEventListener('click', () => {
    el.chatInput.value = card.dataset.prompt;
    autoResizeInput();
    updateCharCounter();
    handleSend();
  });
});

el.sendBtn.addEventListener('click', handleSend);
el.stopBtn.addEventListener('click', () => { state.abortGeneration = true; });

function handleSend() {
  const text = el.chatInput.value.trim();
  if (!text && !state.pendingFiles.length) return;
  if (state.isGenerating) return;

  let chat = state.chats[state.activeChatId];
  if (!chat) { startNewChat(); chat = state.chats[state.activeChatId]; }

  const userMsg = {
    id: uid(),
    role: 'user',
    content: text,
    files: state.pendingFiles.slice(),
    timestamp: Date.now(),
  };
  chat.messages.push(userMsg);

  if (chat.messages.filter((m) => m.role === 'user').length === 1) {
    chat.title = text ? (text.length > 42 ? text.slice(0, 42) + '…' : text) : 'File conversation';
    el.chatTitleDisplay.textContent = chat.title;
  }

  saveChat(chat);
  renderMessages();

  el.chatInput.value = '';
  localStorage.removeItem(LOCAL_KEYS.draft);
  autoResizeInput();
  updateCharCounter();
  state.pendingFiles = [];
  renderFilePreviews();
  el.sendBtn.disabled = true;

  requestAssistantReply(chat);
}

async function requestAssistantReply(chat) {
  const pendingMsg = { id: uid(), role: 'assistant', content: '', pending: true, timestamp: Date.now() };
  chat.messages.push(pendingMsg);
  renderMessages();

  state.isGenerating = true;
  state.abortGeneration = false;
  el.sendBtn.classList.add('hidden');
  el.stopBtn.classList.remove('hidden');

  try {
    const replyText = await callGemini(chat);
    if (state.abortGeneration) {
      pendingMsg.content = pendingMsg.content || '_Generation stopped._';
      pendingMsg.pending = false;
    } else {
      await streamTextIntoMessage(pendingMsg, replyText);
    }
  } catch (err) {
    console.error(err);
    pendingMsg.pending = false;
    pendingMsg.content = friendlyGeminiError(err);
    renderMessages();
  } finally {
    pendingMsg.pending = false;
    saveChat(chat);
    state.isGenerating = false;
    el.sendBtn.classList.remove('hidden');
    el.stopBtn.classList.add('hidden');
    el.sendBtn.disabled = !el.chatInput.value.trim() && !state.pendingFiles.length;
  }
}

function friendlyGeminiError(err) {
  if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
    return "I'd love to help, but the Gemini API key hasn't been configured yet. Add your key to `GEMINI_API_KEY` in script.js to bring me to life.";
  }
  return `Something went wrong reaching the AI: ${err.message || 'Unknown error'}. Please try again.`;
}

async function callGemini(chat) {
  const history = chat.messages
    .filter((m) => !m.pending)
    .slice(-20)
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || '(sent an attachment)' }],
    }));

  const systemInstruction = buildSystemInstruction();

  const body = {
    contents: history,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
  };

  const res = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text) throw new Error('Empty response from Gemini.');
  return text;
}

function buildSystemInstruction() {
  let instruction = `You are Glamour AI, a premium, elegant, and highly capable AI assistant. Your tone is warm, confident, and refined — never robotic. Format responses with Markdown when helpful (headings, lists, code blocks, tables).`;
  if (state.knowledgeBase && state.knowledgeBase.trim()) {
    instruction += `\n\nHere is the Glamour AI knowledge base. If the user's question relates to it, prioritize this information above general knowledge:\n---\n${state.knowledgeBase.trim()}\n---`;
  }
  return instruction;
}

// Simulated token-by-token streaming for a premium typing feel
function streamTextIntoMessage(msg, fullText) {
  return new Promise((resolve) => {
    msg.pending = false;
    msg.content = '';
    const chunks = fullText.split(/(\s+)/);
    let i = 0;

    const row = document.querySelector(`.message-row[data-id="${msg.id}"]`);
    const bubble = row ? row.querySelector('.msg-bubble') : null;
    if (bubble) bubble.classList.add('typing-cursor');

    function step() {
      if (state.abortGeneration || i >= chunks.length) {
        msg.content = state.abortGeneration ? msg.content : fullText;
        if (bubble) {
          bubble.classList.remove('typing-cursor');
          bubble.innerHTML = renderMarkdown(msg.content);
        }
        resolve();
        return;
      }
      msg.content += chunks[i];
      i++;
      if (bubble) bubble.innerHTML = renderMarkdown(msg.content);
      scrollToBottom();
      setTimeout(step, 16 + Math.random() * 12);
    }
    step();
  });
}

function regenerateFrom(assistantMsgId) {
  const chat = state.chats[state.activeChatId];
  if (!chat || state.isGenerating) return;
  const idx = chat.messages.findIndex((m) => m.id === assistantMsgId);
  if (idx === -1) return;
  chat.messages.splice(idx, 1);
  saveChat(chat);
  renderMessages();
  requestAssistantReply(chat);
}

/* --------------------------------------------------------------------------
   19. SYSTEM THEME LISTENER
   -------------------------------------------------------------------------- */
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (state.theme === 'system') applyTheme('system');
});

/* --------------------------------------------------------------------------
   20. SAFETY NET — never leave loader stuck
   -------------------------------------------------------------------------- */
setTimeout(() => { if (!el.loader.classList.contains('fade-out')) finishLoaderOnce(); }, 3000);
