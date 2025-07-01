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
const textToolBtn = document.getElementById("textToolBtn");
const textInputOverlay = document.getElementById("textInputOverlay");
const drawToolBtn = document.getElementById("drawToolBtn");

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentColor = colorPicker.value;
let currentBrushSize = parseInt(brushSizeSelector.value);
let localStream = null;
let peer = null;
let audioCallActive = false;
let username = "";
let isTextMode = false;
let activeTool = "draw"; // 'draw' or 'text'

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

function setActiveTool(tool) {
  activeTool = tool;
  if (tool === "draw") {
    isTextMode = false;
    textToolBtn.classList.remove("active");
    drawToolBtn.classList.add("active");
    canvas.style.cursor = "crosshair";
  } else if (tool === "text") {
    isTextMode = true;
    textToolBtn.classList.add("active");
    drawToolBtn.classList.remove("active");
    canvas.style.cursor = "text";
  }
}

// Only allow drawing when draw tool is active
canvas.addEventListener("mousedown", (e) => {
  if (activeTool !== "draw") return;
  isDrawing = true;
  [lastX, lastY] = [e.offsetX, e.offsetY];
});
canvas.addEventListener("mousemove", (e) => {
  if (activeTool !== "draw" || !isDrawing) return;
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
  if (activeTool !== "draw") return;
  isDrawing = false;
});
canvas.addEventListener("mouseout", () => {
  if (activeTool !== "draw") return;
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

if (textToolBtn) {
  textToolBtn.addEventListener("click", () => {
    setActiveTool("text");
    autoCloseMenu && autoCloseMenu();
  });
}
if (drawToolBtn) {
  drawToolBtn.addEventListener("click", () => {
    setActiveTool("draw");
    autoCloseMenu && autoCloseMenu();
  });
}

// Text tool overlay logic
canvas.addEventListener("click", (e) => {
  if (activeTool !== "text") return;
  // Position the overlay input
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  textInputOverlay.style.left = `${rect.left + x - 2}px`;
  textInputOverlay.style.top = `${rect.top + y - 12}px`;
  textInputOverlay.style.fontSize = `${currentBrushSize * 3}px`;
  textInputOverlay.style.color = currentColor;
  textInputOverlay.value = "";
  textInputOverlay.style.display = "block";
  textInputOverlay.focus();
  // Store position for later
  textInputOverlay._canvasX = x;
  textInputOverlay._canvasY = y;
});

textInputOverlay.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const input = textInputOverlay.value;
    if (input && input.trim() !== "") {
      drawText(
        textInputOverlay._canvasX,
        textInputOverlay._canvasY,
        input,
        currentColor,
        currentBrushSize
      );
      socket.emit("draw-text", {
        x: textInputOverlay._canvasX,
        y: textInputOverlay._canvasY,
        text: input,
        color: currentColor,
        size: currentBrushSize,
      });
    }
    textInputOverlay.style.display = "none";
  } else if (e.key === "Escape") {
    textInputOverlay.style.display = "none";
  }
});

// Hide overlay if clicking elsewhere
canvas.addEventListener("mousedown", (e) => {
  if (activeTool !== "text") textInputOverlay.style.display = "none";
});
document.body.addEventListener("mousedown", (e) => {
  if (e.target !== textInputOverlay && e.target !== canvas) {
    textInputOverlay.style.display = "none";
  }
});

function drawText(x, y, text, color, size) {
  ctx.save();
  ctx.font = `${size * 3}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
  ctx.restore();
}

socket.on("draw-text", (data) => {
  drawText(data.x, data.y, data.text, data.color, data.size);
});

// Set default tool on load
setActiveTool("draw");

// HiDPI/Pixel Density support
function setupHiDPICanvas(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset
  ctx.scale(dpr, dpr);
}

let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let panStart = { x: 0, y: 0 };
let panOrigin = { x: 0, y: 0 };

function redrawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Redraw all actions here (drawings, texts, etc.)
  // You may need to keep a stack of actions for this to work fully.
  // For now, this is a placeholder for where you would redraw everything with offsetX/offsetY applied.
}

canvas.addEventListener("mousedown", (e) => {
  if (activeTool === "draw") {
    isDrawing = true;
    [lastX, lastY] = [e.offsetX - offsetX, e.offsetY - offsetY];
  } else if (activeTool !== "text") {
    isPanning = true;
    panStart = { x: e.clientX, y: e.clientY };
    panOrigin = { x: offsetX, y: offsetY };
    canvas.style.cursor = "grab";
  }
});
canvas.addEventListener("mousemove", (e) => {
  if (activeTool === "draw" && isDrawing) {
    const x1 = e.offsetX - offsetX;
    const y1 = e.offsetY - offsetY;
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
  } else if (isPanning) {
    offsetX = panOrigin.x + (e.clientX - panStart.x);
    offsetY = panOrigin.y + (e.clientY - panStart.y);
    redrawAll();
    socket.emit("pan", { offsetX, offsetY });
  }
});
canvas.addEventListener("mouseup", () => {
  isDrawing = false;
  isPanning = false;
  canvas.style.cursor =
    activeTool === "draw"
      ? "crosshair"
      : activeTool === "text"
      ? "text"
      : "grab";
});
canvas.addEventListener("mouseout", () => {
  isDrawing = false;
  isPanning = false;
});

// Touch support for panning
canvas.addEventListener("touchstart", (e) => {
  if (activeTool !== "draw" && e.touches.length === 1) {
    isPanning = true;
    panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    panOrigin = { x: offsetX, y: offsetY };
  }
});
canvas.addEventListener("touchmove", (e) => {
  if (isPanning && e.touches.length === 1) {
    offsetX = panOrigin.x + (e.touches[0].clientX - panStart.x);
    offsetY = panOrigin.y + (e.touches[0].clientY - panStart.y);
    redrawAll();
    socket.emit("pan", { offsetX, offsetY });
  }
});
canvas.addEventListener("touchend", () => {
  isPanning = false;
});

// Pan sync
socket.on("pan", ({ offsetX: newX, offsetY: newY }) => {
  offsetX = newX;
  offsetY = newY;
  redrawAll();
});

// Fix local text rendering: draw immediately on Enter
textInputOverlay.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const input = textInputOverlay.value;
    if (input && input.trim() !== "") {
      drawText(
        textInputOverlay._canvasX - offsetX,
        textInputOverlay._canvasY - offsetY,
        input,
        currentColor,
        currentBrushSize
      );
      socket.emit("draw-text", {
        x: textInputOverlay._canvasX - offsetX,
        y: textInputOverlay._canvasY - offsetY,
        text: input,
        color: currentColor,
        size: currentBrushSize,
      });
    }
    textInputOverlay.style.display = "none";
  } else if (e.key === "Escape") {
    textInputOverlay.style.display = "none";
  }
});

// Update drawLine and drawText to use offsetX/offsetY
function drawLine(x0, y0, x1, y1, color, size) {
  ctx.beginPath();
  ctx.moveTo(x0 + offsetX, y0 + offsetY);
  ctx.lineTo(x1 + offsetX, y1 + offsetY);
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.stroke();
}
function drawText(x, y, text, color, size) {
  ctx.save();
  ctx.font = `${size * 3}px sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.fillText(text, x + offsetX, y + offsetY);
  ctx.restore();
}
// On window resize, update HiDPI canvas
window.addEventListener("resize", () => setupHiDPICanvas(canvas, ctx));
setupHiDPICanvas(canvas, ctx);
