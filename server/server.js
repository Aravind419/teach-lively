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
