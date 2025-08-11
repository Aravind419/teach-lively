require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const { MongoClient } = require("mongodb");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL;
// Allow running without MongoDB for local/dev usage
if (!MONGO_URL) {
  console.warn(
    "WARNING: MONGO_URL is not set. Proceeding without database. Some features like user persistence and saving drawings will be disabled."
  );
}
const DB_NAME = "doodletogether";
let drawingsCollection;
let usersCollection;
let mongoClient;
let dbReady = false;

// Track usernames by socket id
const userNames = {};

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "../public")));

// Health endpoint
app.get("/health", (_req, res) => {
  res.json({ ok: true, dbConnected: !!usersCollection });
});

async function connectToMongoWithRetry() {
  if (!MONGO_URL) return;
  if (dbReady) return;
  try {
    console.log("Attempting MongoDB connection...");
    mongoClient = await MongoClient.connect(MONGO_URL, {
      useUnifiedTopology: true,
    });
    const db = mongoClient.db(DB_NAME);
    drawingsCollection = db.collection("drawings");
    usersCollection = db.collection("users");
    dbReady = true;
    console.log("Connected to MongoDB");
  } catch (err) {
    dbReady = false;
    usersCollection = undefined;
    drawingsCollection = undefined;
    console.error("MongoDB connection error:", err.message);
  }
}

if (MONGO_URL) {
  connectToMongoWithRetry();
  setInterval(() => {
    if (!dbReady) connectToMongoWithRetry();
  }, 15000);
}

io.on("connection", (socket) => {
  console.log("A user connected");
  io.emit("userConnected", io.engine.clientsCount);

  // Send updated user list to all clients
  function broadcastUserList() {
    io.emit("user-list", Object.values(userNames));
  }

  socket.on("set-username", async (name) => {
    userNames[socket.id] = name;
    broadcastUserList();
    // Store or update user in DB
    if (usersCollection && name) {
      try {
        await usersCollection.updateOne(
          { name },
          { $set: { name, lastActive: new Date() } },
          { upsert: true }
        );
      } catch (err) {
        console.error("Error saving user:", err);
      }
    }
  });

  socket.on("draw", (data) => {
    socket.broadcast.emit("draw", data); // Broadcast drawing data to other clients
  });

  socket.on("clear", () => {
    socket.broadcast.emit("clear"); // Broadcast clear event to other clients
  });

  socket.on("save-drawing", async (data) => {
    if (drawingsCollection && data.image) {
      try {
        await drawingsCollection.insertOne({
          image: data.image,
          createdAt: new Date(),
        });
        console.log("Drawing saved to MongoDB");
      } catch (err) {
        console.error("Error saving drawing:", err);
      }
    }
  });

  socket.on("audio-signal", (data) => {
    socket.broadcast.emit("audio-signal", data);
  });

  // --- Interactive features ---
  // Live cursor positions (normalized to canvas size)
  socket.on("cursor-move", (payload) => {
    // payload: { xNorm, yNorm, color, name }
    socket.broadcast.emit("cursor-move", {
      id: socket.id,
      ...payload,
    });
  });

  // Remove cursor when a user leaves the page
  socket.on("disconnecting", () => {
    io.emit("cursor-remove", { id: socket.id });
  });

  // Chat messages
  socket.on("chat-message", ({ message, name }) => {
    const trimmed = (message || "").toString().trim();
    if (!trimmed) return;
    io.emit("chat-message", {
      message: trimmed,
      name: name || userNames[socket.id] || "Anonymous",
      time: Date.now(),
    });
  });

  // Drawing status (start/stop)
  socket.on("start-drawing", ({ name }) => {
    io.emit("drawing-status", {
      name: name || userNames[socket.id],
      isDrawing: true,
    });
  });
  socket.on("stop-drawing", ({ name }) => {
    io.emit("drawing-status", {
      name: name || userNames[socket.id],
      isDrawing: false,
    });
  });

  // Emoji reactions
  socket.on("reaction", ({ type, name }) => {
    io.emit("reaction", {
      type,
      name: name || userNames[socket.id],
      time: Date.now(),
    });
  });

  socket.on("login", async ({ name, password }) => {
    // Fallback: if DB is not available, accept ephemeral login
    if (!usersCollection) {
      socket.username = name || "Guest";
      userNames[socket.id] = socket.username;
      broadcastUserList();
      socket.emit("login-result", { success: true, name: socket.username });
      return;
    }
    try {
      const user = await usersCollection.findOne({ name });
      if (user) {
        if (user.password === password) {
          socket.username = name; // Store username in socket
          socket.emit("login-result", { success: true, name });
        } else {
          socket.emit("login-result", {
            success: false,
            message: "Incorrect password",
          });
        }
      } else {
        // User doesn't exist - don't auto-register
        socket.emit("login-result", {
          success: false,
          message: "User not found. Please register first.",
        });
      }
    } catch (err) {
      socket.emit("login-result", {
        success: false,
        message: "Error: " + err.message,
      });
    }
  });

  socket.on("register", async ({ name, password }) => {
    // Fallback: if DB is not available, accept ephemeral registration
    if (!usersCollection) {
      socket.username = name || "Guest";
      userNames[socket.id] = socket.username;
      broadcastUserList();
      socket.emit("register-result", { success: true, name: socket.username });
      return;
    }
    try {
      const user = await usersCollection.findOne({ name });
      if (user) {
        socket.emit("register-result", {
          success: false,
          message: "Username already exists",
        });
      } else {
        await usersCollection.insertOne({
          name,
          password,
          createdAt: new Date(),
          lastActive: new Date(),
        });
        socket.username = name; // Store username in socket
        socket.emit("register-result", { success: true, name });
      }
    } catch (err) {
      socket.emit("register-result", {
        success: false,
        message: "Error: " + err.message,
      });
    }
  });

  socket.on("logout", () => {
    console.log(`User ${socket.username || "unknown"} logged out`);
    // Clear username from socket
    if (userNames[socket.id]) {
      delete userNames[socket.id];
      broadcastUserList();
    }
    socket.username = null;
  });

  socket.on("delete-account", async (data) => {
    try {
      const { username } = data;
      if (!username) {
        console.log("No username provided for account deletion");
        return;
      }

      console.log(`Deleting account for user: ${username}`);
      if (!usersCollection) {
        // Ephemeral success when no DB
        socket.emit("user-deleted", {
          success: true,
          message: "Account deleted",
        });
      } else {
        // Delete user from database using 'name' field (not 'username')
        const result = await usersCollection.deleteOne({ name: username });

        if (result.deletedCount > 0) {
          console.log(`Account deleted successfully for user: ${username}`);
          socket.emit("user-deleted", {
            success: true,
            message: "Account deleted successfully",
          });
        } else {
          console.log(`No account found to delete for user: ${username}`);
          socket.emit("user-deleted", {
            success: false,
            message: "Account not found",
          });
        }
      }

      // Clear username from socket
      socket.username = null;
    } catch (error) {
      console.error("Error deleting account:", error);
      socket.emit("user-deleted", {
        success: false,
        message: "Error deleting account",
      });
    }
  });

  socket.on("disconnect", () => {
    if (userNames[socket.id]) {
      delete userNames[socket.id];
      broadcastUserList();
    }
    io.emit("userDisconnected", io.engine.clientsCount);
    console.log("A user disconnected");
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
