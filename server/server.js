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
if (!MONGO_URL) {
  console.error(
    "ERROR: MONGO_URL environment variable is not set. Please set it to your MongoDB connection string."
  );
  process.exit(1);
}
const DB_NAME = "doodletogether";
let drawingsCollection;
let usersCollection;

// Track usernames by socket id
const userNames = {};

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "../public")));

MongoClient.connect(MONGO_URL, { useUnifiedTopology: true })
  .then((client) => {
    const db = client.db(DB_NAME);
    drawingsCollection = db.collection("drawings");
    usersCollection = db.collection("users");
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

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

  socket.on("login", async ({ name, password }) => {
    if (!usersCollection) {
      socket.emit("login-result", {
        success: false,
        message: "Database not ready",
      });
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
    if (!usersCollection) {
      socket.emit("register-result", {
        success: false,
        message: "Database not ready",
      });
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
    console.log("User disconnected");
    delete userNames[socket.id];
    broadcastUserList();
    io.emit("userDisconnected", io.engine.clientsCount);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
