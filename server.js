const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Get local IPv4 address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  
  // We want to prefer physical network adapters (like Wi-Fi, Ethernet) over virtual adapters (like WSL, VirtualBox, VMware)
  const preferredKeywords = ['wi-fi', 'wifi', '무선', 'ethernet', '이더넷', 'local area connection'];
  const ignoreKeywords = ['virtual', 'vbox', 'vmware', 'wsl', 'loopback', 'host-only', 'pseudo', 'teredo', 'vethernet', 'v-ethernet', 'hyper-v', 'switch'];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    const shouldIgnore = ignoreKeywords.some(keyword => lowerName.includes(keyword));
    
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const isPreferred = preferredKeywords.some(keyword => lowerName.includes(keyword)) && !shouldIgnore;
        candidates.push({
          address: iface.address,
          name: name,
          isPreferred: isPreferred,
          isVirtual: shouldIgnore
        });
      }
    }
  }

  // Sort candidates: Preferred first, then non-virtual, then virtual
  candidates.sort((a, b) => {
    if (a.isPreferred && !b.isPreferred) return -1;
    if (!a.isPreferred && b.isPreferred) return 1;
    if (!a.isVirtual && b.isVirtual) return -1;
    if (a.isVirtual && !b.isVirtual) return 1;
    return 0;
  });

  if (candidates.length > 0) {
    return candidates[0].address;
  }
  return 'localhost';
}


const LOCAL_IP = getLocalIP();
const MOBILE_URL = `http://${LOCAL_IP}:${PORT}/mobile.html`;

// Initialize default game data (25 balloons)
const defaultPrizes = [
  "스타벅스 커피", "문화상품권 1만원", "꽝 (아쉬워요!)", "치킨 쿠폰", "꽝 (아쉬워요!)",
  "꽝 (아쉬워요!)", "베스킨라빈스 싱글", "스타벅스 커피", "꽝 (아쉬워요!)", "문화상품권 1만원",
  "신세계 상품권 3만원", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)",
  "치킨 쿠폰", "꽝 (아쉬워요!)", "문화상품권 1만원", "꽝 (아쉬워요!)", "베스킨라빈스 싱글",
  "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "대박! 에어팟 프로"
];

let gameState = {
  prizes: [...defaultPrizes],
  popped: Array(25).fill(false)
};

// Load existing data if available
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    gameState.prizes = data.prizes || [...defaultPrizes];
    gameState.popped = data.popped || Array(25).fill(false);
    console.log("Game state successfully loaded from data.json");
  } catch (err) {
    console.error("Error loading data.json, using defaults:", err);
  }
} else {
  saveGameState();
}

function saveGameState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(gameState, null, 2), 'utf8');
  } catch (err) {
    console.error("Error saving game state:", err);
  }
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for root path (Redirects mobile devices to mobile.html automatically)
app.get('/', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  
  if (isMobile) {
    res.redirect('/mobile.html');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Socket.io Real-Time Logic
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Send initial data to any newly connected client
  socket.emit('init-state', {
    popped: gameState.popped,
    prizes: gameState.prizes,
    mobileUrl: MOBILE_URL,
    localIp: LOCAL_IP
  });

  // Host registers
  socket.on('join-host', () => {
    socket.join('host-room');
    console.log(`Host joined: ${socket.id}`);
  });

  // Mobile registers
  socket.on('join-mobile', () => {
    socket.join('mobile-room');
    console.log(`Mobile controller joined: ${socket.id}`);
    io.to('host-room').emit('mobile-connected', { count: io.sockets.adapter.rooms.get('mobile-room')?.size || 0 });
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    io.to('host-room').emit('mobile-disconnected', { count: io.sockets.adapter.rooms.get('mobile-room')?.size || 0 });
  });

  // Admin saves updated prizes
  socket.on('admin-update-prizes', (updatedPrizes) => {
    if (Array.isArray(updatedPrizes) && updatedPrizes.length === 25) {
      gameState.prizes = updatedPrizes;
      saveGameState();
      io.emit('state-updated', { prizes: gameState.prizes, popped: gameState.popped });
      console.log("Prizes updated by Admin");
    }
  });

  // Admin resets the board
  socket.on('admin-reset-board', (options = {}) => {
    gameState.popped = Array(25).fill(false);
    if (options.shuffle) {
      // Shuffle the prizes
      for (let i = gameState.prizes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [gameState.prizes[i], gameState.prizes[j]] = [gameState.prizes[j], gameState.prizes[i]];
      }
      console.log("Board reset and prizes shuffled");
    } else {
      console.log("Board reset (prizes maintained)");
    }
    saveGameState();
    io.emit('state-updated', { prizes: gameState.prizes, popped: gameState.popped });
    io.emit('board-reset');
  });

  // Admin toggles balloon pop state directly (allows single unpop)
  socket.on('admin-toggle-pop', (index) => {
    if (index >= 0 && index < 25) {
      gameState.popped[index] = !gameState.popped[index];
      saveGameState();
      io.emit('state-updated', { prizes: gameState.prizes, popped: gameState.popped });
      console.log(`Admin toggled popped state of index ${index} to ${gameState.popped[index]}`);
    }
  });

  // Mobile player triggers a throw
  socket.on('mobile-throw', (data) => {
    console.log(`Dart thrown from mobile: ${socket.id} with intensity:`, data.intensity || 1);

    // Find unpopped balloons
    const unpoppedIndices = [];
    for (let i = 0; i < gameState.popped.length; i++) {
      if (!gameState.popped[i]) {
        unpoppedIndices.push(i);
      }
    }

    if (unpoppedIndices.length === 0) {
      // All popped
      socket.emit('throw-result', { status: 'error', message: '모든 풍선이 이미 터졌습니다!' });
      return;
    }

    // Pick a random unpopped balloon
    const randomIndex = unpoppedIndices[Math.floor(Math.random() * unpoppedIndices.length)];
    gameState.popped[randomIndex] = true;
    saveGameState();

    const result = {
      index: randomIndex,
      prize: gameState.prizes[randomIndex],
      intensity: data.intensity || 1
    };

    // Broadcast to host (to trigger animation and show result)
    io.to('host-room').emit('balloon-pop-trigger', result);

    // Send back success to the mobile client
    socket.emit('throw-result', {
      status: 'success',
      index: randomIndex,
      prize: gameState.prizes[randomIndex]
    });

    // Sync state to all clients (including Admin)
    io.emit('state-updated', { prizes: gameState.prizes, popped: gameState.popped });
  });

  // Direct pop from Host (click balloon directly as fallback)
  socket.on('host-direct-pop', (index) => {
    if (index >= 0 && index < 25 && !gameState.popped[index]) {
      gameState.popped[index] = true;
      saveGameState();

      const result = {
        index: index,
        prize: gameState.prizes[index],
        intensity: 1.0
      };

      io.to('host-room').emit('balloon-pop-trigger', result);
      io.emit('state-updated', { prizes: gameState.prizes, popped: gameState.popped });
      console.log(`Direct pop from host: index ${index}`);
    }
  });
});

server.listen(PORT, () => {
  console.log("==================================================");
  console.log("🎈 BALLOON POPPING GAME SERVER RUNNING 🎈");
  console.log(`- Local Host Screen: http://localhost:${PORT}`);
  console.log(`- Admin Screen:      http://localhost:${PORT}/admin.html`);
  console.log(`- Mobile Controller:  ${MOBILE_URL}`);
  console.log("==================================================");
  console.log("Connect your mobile device to the same Wi-Fi and open the Mobile Controller URL.");
});
