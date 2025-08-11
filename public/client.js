const socket = io();
const canvas = document.getElementById("whiteboard");
const ctx = canvas.getContext("2d");
const colorPicker = document.getElementById("colorPicker");
const brushSizeSelector = document.getElementById("brushSize");
const clearCanvasBtn = document.getElementById("clearCanvas");
const saveImageBtn = document.getElementById("saveImage");
const connectionStatus = document.getElementById("connectionStatus");
const startAudioCallBtn = document.getElementById("startAudioCall");
const stopAudioCallBtn = document.getElementById("stopAudioCall");
const userList = document.getElementById("userList");
const usernameModal = document.getElementById("usernameModal");
const usernameInput = document.getElementById("usernameInput");
const joinBtn = document.getElementById("joinBtn");
const passwordInput = document.getElementById("passwordInput");
const confirmPasswordInput = document.getElementById("confirmPasswordInput");
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const registerBtn = document.getElementById("registerBtn");
const modalTitle = document.getElementById("modalTitle");
const loginError = document.getElementById("loginError");
const printBtn = document.getElementById("printBtn");
const themeToggle = document.getElementById("themeToggle");
const mobileMoreBtn = document.getElementById("mobileMoreBtn");
const logoutBtn = document.getElementById("logoutBtn");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");
const confirmModal = document.getElementById("confirmModal");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const uploadImageBtn = document.getElementById("uploadImageBtn");
const imageInput = document.getElementById("imageInput");
const clearCanvasFloatingBtn = document.getElementById("clearCanvasFloating");
// Interactive UI elements
const chatPanel = document.getElementById("chatPanel");
const chatToggleBtn = document.getElementById("chatToggleBtn");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const cursorOverlay = document.getElementById("cursorOverlay");
const reactionOverlay = document.getElementById("reactionOverlay");
const toastContainer = document.getElementById("toastContainer");
const reactionsBar = document.getElementById("reactionsBar");

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = colorPicker.value;
let currentBrushSize = parseInt(brushSizeSelector.value);
let localStream = null;
let peer = null;
let audioCallActive = false;
let username = "";

// Utility: throttling
function throttle(fn, wait) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn.apply(this, args);
    }
  };
}

// Utility: toasts
function showToast(text) {
  if (!toastContainer) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  toastContainer.appendChild(el);
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 2200);
}

// Mobile menu toggle logic
const menuToggle = document.getElementById("menuToggle");
const controlPanel = document.getElementById("controlPanel");
if (menuToggle && controlPanel) {
  menuToggle.addEventListener("click", () => {
    controlPanel.classList.toggle("open");
  });
  // Auto-close menu after action on mobile
  function autoCloseMenu() {
    if (window.innerWidth <= 700) {
      controlPanel.classList.remove("open");
    }
  }
  // Color picker
  colorPicker.addEventListener("change", autoCloseMenu);
  // Brush size
  brushSizeSelector.addEventListener("change", autoCloseMenu);
  // Clear, save, print, audio call
  [
    clearCanvasBtn,
    saveImageBtn,
    printBtn,
    startAudioCallBtn,
    stopAudioCallBtn,
  ].forEach((btn) => {
    if (btn) btn.addEventListener("click", autoCloseMenu);
  });
}

// Set canvas dimensions
function resizeCanvas() {
  const isMobile = window.innerWidth <= 700;
  // Snapshot current canvas to restore after resize
  let snapshotUrl = null;
  try {
    snapshotUrl = canvas.toDataURL();
  } catch (_) {}

  const navbarEl = document.querySelector(".navbar");
  if (isMobile) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight - (navbarEl ? navbarEl.offsetHeight : 0);
  } else {
    const controlPanelEl = document.querySelector(".control-panel");
    const chatEl = document.getElementById("chatPanel");
    const controlWidth = controlPanelEl ? controlPanelEl.offsetWidth : 0;
    const chatVisible = chatEl && chatEl.style.display !== "none";
    const chatWidth = chatVisible ? chatEl.offsetWidth : 0;
    canvas.width = window.innerWidth - controlWidth - chatWidth;
    canvas.height = window.innerHeight - (navbarEl ? navbarEl.offsetHeight : 0);
  }

  // Restore snapshot to avoid clearing drawings due to canvas resize
  if (snapshotUrl) {
    const img = new window.Image();
    img.onload = function () {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = snapshotUrl;
  }
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas(); // Initial resize

// Socket.io events
socket.on("connect", () => {
  console.log("Connected to server");
  connectionStatus.textContent = "🟢 Connected";
  connectionStatus.classList.remove("disconnected");
  connectionStatus.classList.add("connected");
  if (username) {
    socket.emit("set-username", username);
  }
  showToast("Connected");
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
  connectionStatus.textContent = "🔴 Disconnected";
  connectionStatus.classList.remove("connected");
  connectionStatus.classList.add("disconnected");
  showToast("Disconnected");
});

socket.on("userConnected", (count) => {
  console.log(`User connected. Total users: ${count}`);
});

socket.on("userDisconnected", (count) => {
  console.log(`User disconnected. Total users: ${count}`);
});

socket.on("draw", (data) => {
  saveAndDrawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.size);
});

socket.on("clear", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  clearCanvasLocal();
});

// --- Live cursors ---
const liveCursors = new Map(); // id -> { el }

function ensureCursorElement(id, color, name) {
  let record = liveCursors.get(id);
  if (!record) {
    const el = document.createElement("div");
    el.className = "live-cursor";
    const dot = document.createElement("div");
    dot.className = "dot";
    if (color) dot.style.background = color;
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = name || "Friend";
    el.appendChild(dot);
    el.appendChild(label);
    if (cursorOverlay) cursorOverlay.appendChild(el);
    record = { el };
    liveCursors.set(id, record);
  }
  return record;
}

socket.on("cursor-move", ({ id, xNorm, yNorm, color, name }) => {
  const rect = canvas.getBoundingClientRect();
  const x = xNorm * rect.width;
  const y = yNorm * rect.height;
  const { el } = ensureCursorElement(id, color, name);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
});

socket.on("cursor-remove", ({ id }) => {
  const record = liveCursors.get(id);
  if (record && record.el && record.el.parentNode) {
    record.el.parentNode.removeChild(record.el);
  }
  liveCursors.delete(id);
});

// Drawing functions
function drawLine(x0, y0, x1, y1, color, size) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.stroke();
}

// --- Accurate coordinate mapping ---
function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  let x, y;
  if (e.touches && e.touches.length > 0) {
    x = e.touches[0].clientX - rect.left;
    y = e.touches[0].clientY - rect.top;
  } else {
    x = e.clientX - rect.left;
    y = e.clientY - rect.top;
  }
  x *= canvas.width / rect.width;
  y *= canvas.height / rect.height;
  return { x, y };
}

function emitCursor(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX =
    e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
  const clientY =
    e.touches && e.touches.length ? e.touches[0].clientY : e.clientY;
  const xNorm = (clientX - rect.left) / rect.width;
  const yNorm = (clientY - rect.top) / rect.height;
  if (xNorm < 0 || xNorm > 1 || yNorm < 0 || yNorm > 1) return;
  socket.emit("cursor-move", {
    xNorm,
    yNorm,
    color: currentColor,
    name: username,
  });
}
const throttledEmitCursor = throttle(emitCursor, 40);

// --- Redraw everything ---
function redrawEverything() {
  // Restore from localStorage snapshot so resizing doesn't wipe drawings
  restoreCanvasFromLocal();
}

// --- Patch all event listeners to use getCanvasCoords and redrawEverything ---
canvas.addEventListener("mousedown", (e) => {
  const { x, y } = getCanvasCoords(e);
  throttledEmitCursor(e);
  if (tempImage) {
    if (
      x > tempImageX + tempImageW - resizeHandleSize &&
      x < tempImageX + tempImageW + resizeHandleSize &&
      y > tempImageY + tempImageH - resizeHandleSize &&
      y < tempImageY + tempImageH + resizeHandleSize
    ) {
      resizingImage = true;
      dragOffsetX = x - (tempImageX + tempImageW);
      dragOffsetY = y - (tempImageY + tempImageH);
      return;
    }
    if (
      x > tempImageX &&
      x < tempImageX + tempImageW &&
      y > tempImageY &&
      y < tempImageY + tempImageH
    ) {
      draggingImage = true;
      dragOffsetX = x - tempImageX;
      dragOffsetY = y - tempImageY;
      return;
    }
  }
  isDrawing = true;
  [lastX, lastY] = [x, y];
  socket.emit("start-drawing", { name: username });
});

canvas.addEventListener("mousemove", (e) => {
  const { x, y } = getCanvasCoords(e);
  throttledEmitCursor(e);
  if (draggingImage && tempImage) {
    tempImageX = x - dragOffsetX;
    tempImageY = y - dragOffsetY;
    drawTempImage();
  } else if (resizingImage && tempImage) {
    tempImageW = Math.max(30, x - tempImageX);
    tempImageH = Math.max(30, y - tempImageY);
    drawTempImage();
  } else if (!isDrawing) return;
  saveAndDrawLine(lastX, lastY, x, y, currentColor, currentBrushSize);
  socket.emit("draw", {
    x0: lastX,
    y0: lastY,
    x1: x,
    y1: y,
    color: currentColor,
    size: currentBrushSize,
  });
  [lastX, lastY] = [x, y];
});

canvas.addEventListener("mouseup", (e) => {
  draggingImage = false;
  resizingImage = false;
  isDrawing = false;
  socket.emit("stop-drawing", { name: username });
});

canvas.addEventListener("mouseout", () => {
  isDrawing = false;
  socket.emit("stop-drawing", { name: username });
});

// Control panel event listeners
colorPicker.addEventListener("change", (e) => {
  currentColor = e.target.value;
});

brushSizeSelector.addEventListener("change", (e) => {
  currentBrushSize = parseInt(e.target.value);
});

clearCanvasBtn.addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit("clear");
  clearCanvasLocal();
});

// Audio call logic
startAudioCallBtn.addEventListener("click", async () => {
  if (audioCallActive) return;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    peer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: localStream,
    });
    peer.on("signal", (data) => {
      socket.emit("audio-signal", data);
    });
    peer.on("stream", (stream) => {
      playAudioStream(stream);
    });
    audioCallActive = true;
    startAudioCallBtn.style.display = "none";
    stopAudioCallBtn.style.display = "inline-block";
  } catch (err) {
    alert("Could not start audio call: " + err.message);
  }
});

stopAudioCallBtn.addEventListener("click", () => {
  if (peer) peer.destroy();
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
  audioCallActive = false;
  startAudioCallBtn.style.display = "inline-block";
  stopAudioCallBtn.style.display = "none";
});

socket.on("audio-signal", (data) => {
  if (!audioCallActive) {
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      localStream = stream;
      peer = new SimplePeer({
        initiator: false,
        trickle: false,
        stream: localStream,
      });
      peer.on("signal", (signal) => {
        socket.emit("audio-signal", signal);
      });
      peer.on("stream", (stream) => {
        playAudioStream(stream);
      });
      peer.signal(data);
      audioCallActive = true;
      startAudioCallBtn.style.display = "none";
      stopAudioCallBtn.style.display = "inline-block";
    });
  } else if (peer) {
    peer.signal(data);
  }
});

function playAudioStream(stream) {
  let audio = document.getElementById("audioCallElement");
  if (!audio) {
    audio = document.createElement("audio");
    audio.id = "audioCallElement";
    audio.autoplay = true;
    document.body.appendChild(audio);
  }
  audio.srcObject = stream;
}

// Save drawing to server
function saveDrawingToServer() {
  const dataURL = canvas.toDataURL("image/png");
  socket.emit("save-drawing", { image: dataURL });
}

// Modify saveImageBtn to also save to server
saveImageBtn.addEventListener("click", () => {
  const dataURL = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = "doodletogether.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  saveDrawingToServer();
});

// Prevent interaction until username is set
function showUsernameModal() {
  usernameModal.style.display = "flex";
  usernameInput.value = "";
  usernameInput.focus();
}
function hideUsernameModal() {
  usernameModal.style.display = "none";
}

// Tab switching logic
loginTab.addEventListener("click", () => {
  loginTab.style.background = "#007bff";
  loginTab.style.color = "#fff";
  registerTab.style.background = "#fff";
  registerTab.style.color = "#007bff";
  modalTitle.textContent = "Login to join";
  joinBtn.style.display = "";
  registerBtn.style.display = "none";
  confirmPasswordInput.style.display = "none";
  loginError.textContent = "";
});
registerTab.addEventListener("click", () => {
  loginTab.style.background = "#fff";
  loginTab.style.color = "#007bff";
  registerTab.style.background = "#007bff";
  registerTab.style.color = "#fff";
  modalTitle.textContent = "Register new account";
  joinBtn.style.display = "none";
  registerBtn.style.display = "";
  confirmPasswordInput.style.display = "";
  loginError.textContent = "";
});

// Registration logic
registerBtn.addEventListener("click", () => {
  const name = usernameInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  if (!name || !password || !confirmPassword) {
    loginError.textContent = "Please fill all fields.";
    return;
  }
  if (password !== confirmPassword) {
    loginError.textContent = "Passwords do not match.";
    return;
  }
  socket.emit("register", { name, password });
});

// Show modal on load, unless username is in localStorage
const storedName = localStorage.getItem("username");
if (storedName) {
  username = storedName;
  socket.emit("set-username", username);
  hideUsernameModal();
} else {
  showUsernameModal();
}

joinBtn.addEventListener("click", () => {
  const name = usernameInput.value.trim();
  const password = passwordInput.value;
  if (name && password) {
    socket.emit("login", { name, password });
  } else {
    loginError.textContent = "Please enter username and password.";
    usernameInput.focus();
  }
});
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (joinBtn.style.display !== "none") joinBtn.click();
    if (registerBtn.style.display !== "none") registerBtn.click();
  }
});
passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (joinBtn.style.display !== "none") joinBtn.click();
    if (registerBtn.style.display !== "none") registerBtn.click();
  }
});
confirmPasswordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && registerBtn.style.display !== "none")
    registerBtn.click();
});

// Listen for login result
socket.on("login-result", (result) => {
  if (result.success) {
    username = result.name;
    localStorage.setItem("username", username);
    hideUsernameModal();
    socket.emit("set-username", username);
  } else {
    loginError.textContent = result.message || "Login failed";
    passwordInput.value = "";
    passwordInput.focus();
  }
});
// Listen for register result
socket.on("register-result", (result) => {
  if (result.success) {
    username = result.name;
    localStorage.setItem("username", username);
    hideUsernameModal();
    socket.emit("set-username", username);
  } else {
    loginError.textContent = result.message || "Registration failed";
    passwordInput.value = "";
    confirmPasswordInput.value = "";
    passwordInput.focus();
  }
});

// User list update
function renderUserList(users) {
  if (userList) {
    if (Array.isArray(users) && users.length > 0) {
      userList.innerHTML = users
        .map((u) => `<span class="user-chip">${u}</span>`)
        .join(" ");
    } else {
      userList.innerHTML =
        '<span style="color:#ccc;">No other users online</span>';
    }
  }
}
socket.on("user-list", (users) => {
  renderUserList(users);
});

// Add print button logic
if (printBtn) {
  printBtn.addEventListener("click", () => {
    window.print();
  });
}

// --- Touch support for drawing on mobile ---
canvas.addEventListener("touchstart", (e) => {
  const { x, y } = getCanvasCoords(e);
  isDrawing = true;
  [lastX, lastY] = [x, y];
  throttledEmitCursor(e);
  socket.emit("start-drawing", { name: username });
});
canvas.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    if (!isDrawing) return;
    saveAndDrawLine(lastX, lastY, x, y, currentColor, currentBrushSize);
    throttledEmitCursor(e);
    socket.emit("draw", {
      x0: lastX,
      y0: lastY,
      x1: x,
      y1: y,
      color: currentColor,
      size: currentBrushSize,
    });
    [lastX, lastY] = [x, y];
  },
  { passive: false }
);
canvas.addEventListener("touchend", () => {
  isDrawing = false;
  socket.emit("stop-drawing", { name: username });
});
canvas.addEventListener("touchcancel", () => {
  isDrawing = false;
  socket.emit("stop-drawing", { name: username });
});

// Theme toggle logic
if (themeToggle) {
  // Set initial theme from localStorage or system preference
  function setTheme(dark) {
    document.body.classList.toggle("dark", dark);
    themeToggle.textContent = dark ? "☀️" : "🌙";
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const savedTheme = localStorage.getItem("theme");
  let darkMode = savedTheme === "dark" || (savedTheme === null && prefersDark);
  setTheme(darkMode);
  themeToggle.addEventListener("click", () => {
    darkMode = !document.body.classList.contains("dark");
    setTheme(darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  });
}

// Chat UI
function renderChatMessage({ name: from, message, time }) {
  if (!chatMessages) return;
  const el = document.createElement("div");
  el.className = "chat-message";
  const meta = document.createElement("div");
  meta.className = "meta";
  const when = new Date(time || Date.now()).toLocaleTimeString();
  meta.textContent = `${from || "Anonymous"} • ${when}`;
  const text = document.createElement("div");
  text.className = "text";
  text.textContent = message;
  el.appendChild(meta);
  el.appendChild(text);
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChat() {
  const msg = (chatInput?.value || "").trim();
  if (!msg) return;
  socket.emit("chat-message", { message: msg, name: username });
  chatInput.value = "";
}

if (chatSendBtn && chatInput) {
  chatSendBtn.addEventListener("click", sendChat);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });
}

if (chatToggleBtn && chatPanel) {
  chatToggleBtn.addEventListener("click", () => {
    const isMobile = window.innerWidth <= 700;
    if (isMobile) {
      chatPanel.classList.toggle("open");
    } else {
      const isHidden = chatPanel.style.display === "none";
      chatPanel.style.display = isHidden ? "flex" : "none";
      resizeCanvas();
    }
  });
  function setInitialChatVisibility() {
    const isMobile = window.innerWidth <= 700;
    chatPanel.classList.remove("open");
    chatPanel.style.display = isMobile ? "" : "flex";
    // Expose navbar height to CSS for mobile chat sizing
    const navbarEl = document.querySelector(".navbar");
    const navH = navbarEl ? navbarEl.offsetHeight : 0;
    document.documentElement.style.setProperty("--navbar-height", `${navH}px`);
  }
  window.addEventListener("resize", setInitialChatVisibility);
  setInitialChatVisibility();

  // Hide chat when clicking outside (desktop and mobile)
  document.addEventListener("click", (e) => {
    const isMobile = window.innerWidth <= 700;
    const clickedInsideChat = chatPanel.contains(e.target);
    const clickedToggle = chatToggleBtn.contains(e.target);
    if (clickedInsideChat || clickedToggle) return;
    if (isMobile) {
      if (chatPanel.classList.contains("open")) {
        chatPanel.classList.remove("open");
      }
    } else {
      if (chatPanel.style.display !== "none") {
        chatPanel.style.display = "none";
        resizeCanvas();
      }
    }
  });
}

socket.on("chat-message", (payload) => {
  renderChatMessage(payload);
});

// Drawing status toasts
socket.on("drawing-status", ({ name: who, isDrawing }) => {
  if (!who || who === username) return;
  showToast(`${who} ${isDrawing ? "started" : "stopped"} drawing`);
});

// Emoji reactions
function spawnReaction(emoji) {
  if (!reactionOverlay) return;
  const rect = canvas.getBoundingClientRect();
  const x = rect.width - 60;
  const y = rect.height - 80;
  const el = document.createElement("div");
  el.className = "reaction";
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.textContent = emoji;
  reactionOverlay.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

if (reactionsBar) {
  reactionsBar.addEventListener("click", (e) => {
    const btn = e.target.closest(".reaction-btn");
    if (!btn) return;
    const emoji = btn.getAttribute("data-reaction");
    if (!emoji) return;
    socket.emit("reaction", { type: emoji, name: username });
    spawnReaction(emoji);
  });
}

socket.on("reaction", ({ type }) => {
  spawnReaction(type);
});

// Mobile drawer logic
if (mobileMoreBtn && controlPanel) {
  function isMobile() {
    return window.innerWidth <= 700;
  }
  function openDrawer() {
    controlPanel.classList.add("open");
  }
  function closeDrawer() {
    controlPanel.classList.remove("open");
  }
  mobileMoreBtn.addEventListener("click", () => {
    if (controlPanel.classList.contains("open")) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });
  // Close drawer when clicking outside
  document.addEventListener("click", (e) => {
    if (
      isMobile() &&
      controlPanel.classList.contains("open") &&
      !controlPanel.contains(e.target) &&
      e.target !== mobileMoreBtn
    ) {
      closeDrawer();
    }
  });
  // Auto-close drawer after action
  [
    colorPicker,
    brushSizeSelector,
    clearCanvasBtn,
    saveImageBtn,
    printBtn,
    startAudioCallBtn,
    stopAudioCallBtn,
  ].forEach((el) => {
    if (el) el.addEventListener("change", () => isMobile() && closeDrawer());
    if (el) el.addEventListener("click", () => isMobile() && closeDrawer());
  });
  // Hide control panel by default on mobile
  function updatePanelVisibility() {
    if (isMobile()) {
      closeDrawer();
    } else {
      controlPanel.classList.remove("open");
      controlPanel.style.transform = "";
    }
  }
  window.addEventListener("resize", updatePanelVisibility);
  updatePanelVisibility();
}

// Logout and Delete Account functionality
function showConfirmModal() {
  confirmModal.style.display = "flex";
}

function hideConfirmModal() {
  confirmModal.style.display = "none";
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    // Clear user session
    username = "";
    localStorage.removeItem("username");

    // Emit logout event to server
    socket.emit("logout");

    // Show login modal
    showUsernameModal();

    // Close mobile drawer if open
    if (window.innerWidth <= 700 && controlPanel) {
      controlPanel.classList.remove("open");
    }
  });
}

if (deleteAccountBtn) {
  deleteAccountBtn.addEventListener("click", () => {
    showConfirmModal();
  });
}

if (cancelDeleteBtn) {
  cancelDeleteBtn.addEventListener("click", hideConfirmModal);
}

if (confirmDeleteBtn) {
  confirmDeleteBtn.addEventListener("click", () => {
    // Emit delete account event to server
    socket.emit("delete-account", { username });

    // Clear user session
    username = "";
    localStorage.removeItem("username");

    // Hide confirmation modal
    hideConfirmModal();

    // Show registration modal (to register again)
    showUsernameModal();
    registerTab.click(); // Switch to register tab

    // Close mobile drawer if open
    if (window.innerWidth <= 700 && controlPanel) {
      controlPanel.classList.remove("open");
    }
  });
}

// Close modal when clicking outside
if (confirmModal) {
  confirmModal.addEventListener("click", (e) => {
    if (e.target === confirmModal) {
      hideConfirmModal();
    }
  });
}

// Image upload and drag/resize logic
let tempImage = null;
let tempImageX = 50;
let tempImageY = 50;
let tempImageW = 150;
let tempImageH = 150;
let draggingImage = false;
let resizingImage = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let resizeHandleSize = 16;

if (uploadImageBtn && imageInput) {
  uploadImageBtn.addEventListener("click", () => imageInput.click());
  imageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (evt) {
      const img = new window.Image();
      img.onload = function () {
        tempImage = img;
        tempImageX = 50;
        tempImageY = 50;
        tempImageW = Math.min(200, img.width);
        tempImageH = Math.min(200, img.height);
        drawTempImage();
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function drawTempImage() {
  redrawEverything();
  if (tempImage) {
    ctx.drawImage(tempImage, tempImageX, tempImageY, tempImageW, tempImageH);
    ctx.fillStyle = "#007bff";
    ctx.fillRect(
      tempImageX + tempImageW - resizeHandleSize / 2,
      tempImageY + tempImageH - resizeHandleSize / 2,
      resizeHandleSize,
      resizeHandleSize
    );
    showZoomControls(true);
  } else {
    showZoomControls(false);
  }
}

canvas.addEventListener("dblclick", (e) => {
  // Place the image permanently on double click
  if (tempImage) {
    ctx.drawImage(tempImage, tempImageX, tempImageY, tempImageW, tempImageH);
    tempImage = null;
    saveCanvasToLocal();
    // Optionally: emit drawing update to others here
  }
});

// --- Canvas Persistence Logic ---
function saveCanvasToLocal() {
  try {
    const dataURL = canvas.toDataURL();
    localStorage.setItem("doodle_canvas", dataURL);
  } catch (e) {
    // Ignore quota errors
  }
}

function restoreCanvasFromLocal() {
  const dataURL = localStorage.getItem("doodle_canvas");
  if (dataURL) {
    const img = new window.Image();
    img.onload = function () {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataURL;
  }
}

function clearCanvasLocal() {
  localStorage.removeItem("doodle_canvas");
}

// Restore on page load
window.addEventListener("DOMContentLoaded", restoreCanvasFromLocal);

// Save after every drawing or image placement
function saveAndDrawLine(x0, y0, x1, y1, color, size) {
  drawLine(x0, y0, x1, y1, color, size);
  saveCanvasToLocal();
}

if (clearCanvasFloatingBtn) {
  clearCanvasFloatingBtn.addEventListener("click", () => {
    if (clearCanvasBtn) clearCanvasBtn.click();
  });
}

// Redraw everything on resize
window.addEventListener("resize", () => {
  resizeCanvas();
  redrawEverything();
});

// Redraw everything after clear, image placement, or restore
function clearAllImages() {
  placedImages = [];
  localStorage.removeItem("doodle_images");
  redrawEverything();
}
