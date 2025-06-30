# DoodleTogether - Realtime Friendship Whiteboard

DoodleTogether is a real-time collaborative drawing board website where friends can draw, write, doodle, and have fun live on the same canvas from different devices.

## 🎯 Project Goal
To build a real-time collaborative drawing board website where both Aravind and Chaitra can draw, write, doodle, and have fun live on the same canvas... from two different devices… anytime... anywhere 🚀

## ✅ Core Features
- **Canvas Drawing**: Both users can draw freely with mouse/touch.
- **Real-time Sync**: Changes reflect instantly for both users.
- **Different Pen Colors**: Color palette to choose drawing colors.
- **Pen Size Control**: Small/Medium/Large brush options.
- **Clear Canvas**: Option to clear the whole board.
- **Save Drawing**: Save canvas as image (PNG).
- **Multi-user Support**: Can handle 2 users drawing at the same time.
- **WebSocket Connection**: Real-time updates using Socket.io.

## 🖥️ Technical Stack
- **Frontend**: HTML5, CSS3, JavaScript, Canvas API
- **Realtime Backend**: Node.js + Express.js + Socket.io
- **Deployment**: Railway / Render / Vercel (Free hosting options)

## 🔗 Architecture Overview
```
User A (Browser) <---> Socket.io <---> Node.js Server <---> Socket.io <---> User B (Browser)
```

## 🎛️ UI/UX Design Details
### Layout Sections:
- **Top Navbar**:
    - Website Name
    - Connection Status Indicator (🟢 Connected / 🔴 Disconnected)
- **Main Canvas Area**:
    - Full screen whiteboard
    - Canvas element using HTML5
- **Control Panel (Sidebar or Bottom bar)**:
    - Color Picker 🎨
    - Brush Size Selector 🖌️
    - Clear Button 🧹
    - Save as Image 📥

## 📡 Socket.io Events Design
- `draw`: Sync drawing data (coordinates, color, brush size)
- `clear`: Clear both canvases
- `userConnected`: Notify when a friend joins
- `userDisconnected`: Notify when someone leaves

## 🚀 User Flow
1. Both open the website 📱💻
2. Both get connected automatically through WebSocket (Socket.io)
3. Start doodling LIVE 🎨
4. Can change colors, sizes, clear, save anytime ✨
5. Chat live through drawings 😂

## 🧱 Folder Structure
```
DoodleTogether/
├── public/
│   ├── index.html
│   ├── style.css
│   └── client.js
├── server/
│   └── server.js
├── package.json
└── README.md
```

## 🚀 Getting Started

To run this project locally:

1.  **Install dependencies**:
    ```bash
    npm install
    ```
2.  **Start the server**:
    ```bash
    npm start
    ```
3.  Open your browser and navigate to `http://localhost:3000`.
    Share the link with a friend to doodle together!