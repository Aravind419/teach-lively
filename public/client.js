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

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = colorPicker.value;
let currentBrushSize = parseInt(brushSizeSelector.value);
let localStream = null;
let peer = null;
let audioCallActive = false;
let username = "";

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
  if (isMobile) {
    canvas.width = window.innerWidth;
    canvas.height =
      window.innerHeight -
      (document.querySelector(".navbar").offsetHeight || 0) -
      60;
  } else {
    canvas.width =
      window.innerWidth -
      (document.querySelector(".control-panel").offsetWidth || 0);
    canvas.height =
      window.innerHeight -
      (document.querySelector(".navbar").offsetHeight || 0);
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
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
  connectionStatus.textContent = "🔴 Disconnected";
  connectionStatus.classList.remove("connected");
  connectionStatus.classList.add("disconnected");
});

socket.on("userConnected", (count) => {
  console.log(`User connected. Total users: ${count}`);
});

socket.on("userDisconnected", (count) => {
  console.log(`User disconnected. Total users: ${count}`);
});

socket.on("draw", (data) => {
  drawLine(data.x0, data.y0, data.x1, data.y1, data.color, data.size);
});

socket.on("clear", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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

canvas.addEventListener("mousedown", (e) => {
  isDrawing = true;
  [lastX, lastY] = [e.offsetX, e.offsetY];
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDrawing) return;
  const x1 = e.offsetX;
  const y1 = e.offsetY;
  drawLine(lastX, lastY, x1, y1, currentColor, currentBrushSize);
  socket.emit("draw", {
    x0: lastX,
    y0: lastY,
    x1: x1,
    y1: y1,
    color: currentColor,
    size: currentBrushSize,
  });
  [lastX, lastY] = [x1, y1];
});

canvas.addEventListener("mouseup", () => {
  isDrawing = false;
});

canvas.addEventListener("mouseout", () => {
  isDrawing = false;
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

// Listen for user list updates
socket.on("user-list", (users) => {
  userList.textContent = "Users: " + users.join(", ");
});

// Add print button logic
if (printBtn) {
  printBtn.addEventListener("click", () => {
    window.print();
  });
}

// --- Touch support for drawing on mobile ---
canvas.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    lastX = e.touches[0].clientX - rect.left;
    lastY = e.touches[0].clientY - rect.top;
  }
});
canvas.addEventListener(
  "touchmove",
  (e) => {
    if (!isDrawing || e.touches.length !== 1) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x1 = e.touches[0].clientX - rect.left;
    const y1 = e.touches[0].clientY - rect.top;
    drawLine(lastX, lastY, x1, y1, currentColor, currentBrushSize);
    socket.emit("draw", {
      x0: lastX,
      y0: lastY,
      x1: x1,
      y1: y1,
      color: currentColor,
      size: currentBrushSize,
    });
    lastX = x1;
    lastY = y1;
  },
  { passive: false }
);
canvas.addEventListener("touchend", () => {
  isDrawing = false;
});
canvas.addEventListener("touchcancel", () => {
  isDrawing = false;
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
