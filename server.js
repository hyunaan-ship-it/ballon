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

let accountsState = {
  "1": { prizes: [...defaultPrizes], popped: Array(25).fill(false) },
  "2": { prizes: [...defaultPrizes], popped: Array(25).fill(false) },
  "3": { prizes: [...defaultPrizes], popped: Array(25).fill(false) },
  "4": { prizes: [...defaultPrizes], popped: Array(25).fill(false) }
};

// Load existing data if available
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // Auto-convert legacy single-account data if detected
    if (data.prizes && data.popped) {
      accountsState["1"] = {
        prizes: data.prizes,
        popped: data.popped
      };
      console.log("Legacy game state successfully migrated to Account 1");
    } else {
      for (const id of ["1", "2", "3", "4"]) {
        if (data[id]) {
          accountsState[id] = {
            prizes: data[id].prizes || [...defaultPrizes],
            popped: data[id].popped || Array(25).fill(false)
          };
        }
      }
      console.log("Game states for all accounts successfully loaded from data.json");
    }
  } catch (err) {
    console.error("Error loading data.json, using defaults:", err);
  }
}

saveGameState();

function saveGameState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(accountsState, null, 2), 'utf8');
  } catch (err) {
    console.error("Error saving game state:", err);
  }
}

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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io Real-Time Logic
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Host registers
  socket.on('join-host', (data = {}) => {
    const accountId = String(data.accountId || '1');
    socket.join(`host-room-${accountId}`);
    socket.accountId = accountId;
    console.log(`Host joined Account ${accountId}: ${socket.id}`);

    const state = accountsState[accountId] || { prizes: [...defaultPrizes], popped: Array(25).fill(false) };
    socket.emit('init-state', {
      popped: state.popped,
      prizes: state.prizes,
      mobileUrl: `http://${LOCAL_IP}:${PORT}/mobile.html?account=${accountId}`,
      localIp: LOCAL_IP
    });
  });

  // Mobile registers
  socket.on('join-mobile', (data = {}) => {
    const accountId = String(data.accountId || '1');
    socket.join(`mobile-room-${accountId}`);
    socket.accountId = accountId;
    console.log(`Mobile controller joined Account ${accountId}: ${socket.id}`);

    const state = accountsState[accountId] || { prizes: [...defaultPrizes], popped: Array(25).fill(false) };
    socket.emit('init-state', {
      popped: state.popped,
      prizes: state.prizes,
      mobileUrl: `http://${LOCAL_IP}:${PORT}/mobile.html?account=${accountId}`,
      localIp: LOCAL_IP
    });

    const activeMobiles = io.sockets.adapter.rooms.get(`mobile-room-${accountId}`)?.size || 0;
    io.to(`host-room-${accountId}`).emit('mobile-connected', { count: activeMobiles });
  });

  // Admin registers
  socket.on('join-admin', (data = {}) => {
    const accountId = String(data.accountId || '1');
    socket.join(`admin-room-${accountId}`);
    socket.accountId = accountId;
    console.log(`Admin joined Account ${accountId}: ${socket.id}`);

    const state = accountsState[accountId] || { prizes: [...defaultPrizes], popped: Array(25).fill(false) };
    socket.emit('init-state', {
      popped: state.popped,
      prizes: state.prizes,
      mobileUrl: `http://${LOCAL_IP}:${PORT}/mobile.html?account=${accountId}`,
      localIp: LOCAL_IP
    });
  });

  socket.on('disconnect', () => {
    const accountId = socket.accountId;
    console.log(`Socket disconnected: ${socket.id} (Account: ${accountId})`);
    if (accountId) {
      const activeMobiles = io.sockets.adapter.rooms.get(`mobile-room-${accountId}`)?.size || 0;
      io.to(`host-room-${accountId}`).emit('mobile-disconnected', { count: activeMobiles });
    }
  });

  // Admin saves updated prizes
  socket.on('admin-update-prizes', (updatedPrizes) => {
    const accountId = socket.accountId || '1';
    const state = accountsState[accountId];
    if (state && Array.isArray(updatedPrizes) && updatedPrizes.length === 25) {
      state.prizes = updatedPrizes;
      saveGameState();
      io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', { prizes: state.prizes, popped: state.popped });
      console.log(`Prizes updated by Admin for Account ${accountId}`);
    }
  });

  // Admin resets the board
  socket.on('admin-reset-board', (options = {}) => {
    const accountId = socket.accountId || '1';
    const state = accountsState[accountId];
    if (state) {
      state.popped = Array(25).fill(false);
      if (options.shuffle) {
        // Shuffle the prizes
        for (let i = state.prizes.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [state.prizes[i], state.prizes[j]] = [state.prizes[j], state.prizes[i]];
        }
        console.log(`Board reset and prizes shuffled for Account ${accountId}`);
      } else {
        console.log(`Board reset (prizes maintained) for Account ${accountId}`);
      }
      saveGameState();
      io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', { prizes: state.prizes, popped: state.popped });
      io.to(`host-room-${accountId}`).to(`mobile-room-${accountId}`).emit('board-reset');
    }
  });

  // Admin toggles balloon pop state directly
  socket.on('admin-toggle-pop', (index) => {
    const accountId = socket.accountId || '1';
    const state = accountsState[accountId];
    if (state && index >= 0 && index < 25) {
      state.popped[index] = !state.popped[index];
      saveGameState();
      io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', { prizes: state.prizes, popped: state.popped });
      console.log(`Admin toggled popped state of index ${index} to ${state.popped[index]} for Account ${accountId}`);
    }
  });

  // Mobile player triggers a throw
  socket.on('mobile-throw', (data) => {
    const accountId = socket.accountId || '1';
    const state = accountsState[accountId];
    if (!state) return;

    console.log(`Dart thrown from mobile: ${socket.id} on Account ${accountId} with intensity:`, data.intensity || 1);

    // Find unpopped balloons
    const unpoppedIndices = [];
    for (let i = 0; i < state.popped.length; i++) {
      if (!state.popped[i]) {
        unpoppedIndices.push(i);
      }
    }

    if (unpoppedIndices.length === 0) {
      socket.emit('throw-result', { status: 'error', message: '모든 풍선이 이미 터졌습니다!' });
      return;
    }

    // Determine if it is a miss
    const isMiss = (data.intensity < 0.6) || (Math.random() < 0.15);

    if (isMiss) {
      const randomIndex = unpoppedIndices[Math.floor(Math.random() * unpoppedIndices.length)];
      io.to(`host-room-${accountId}`).emit('balloon-miss-trigger', {
        index: randomIndex,
        intensity: data.intensity || 1
      });
      socket.emit('throw-result', {
        status: 'miss',
        index: randomIndex
      });
      return;
    }

    // Pick a random unpopped balloon (Hit Success!)
    const randomIndex = unpoppedIndices[Math.floor(Math.random() * unpoppedIndices.length)];
    state.popped[randomIndex] = true;
    saveGameState();

    const result = {
      index: randomIndex,
      prize: state.prizes[randomIndex],
      intensity: data.intensity || 1
    };

    // Broadcast to host (to trigger animation and show result)
    io.to(`host-room-${accountId}`).emit('balloon-pop-trigger', result);

    // Send back success to the mobile client
    socket.emit('throw-result', {
      status: 'success',
      index: randomIndex,
      prize: state.prizes[randomIndex]
    });

    // Sync state to all clients in this account
    io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', { prizes: state.prizes, popped: state.popped });
  });

  // Mobile/Host confirms prize claim (sync dismiss)
  socket.on('confirm-prize-claim', () => {
    const accountId = socket.accountId || '1';
    console.log(`Prize claim confirmed on Account ${accountId}`);
    io.to(`host-room-${accountId}`).to(`mobile-room-${accountId}`).to(`admin-room-${accountId}`).emit('prize-confirmed');
  });

  // Direct pop from Host (click balloon directly as fallback)
  socket.on('host-direct-pop', (index) => {
    const accountId = socket.accountId || '1';
    const state = accountsState[accountId];
    if (state && index >= 0 && index < 25 && !state.popped[index]) {
      state.popped[index] = true;
      saveGameState();

      const result = {
        index: index,
        prize: state.prizes[index],
        intensity: 1.0
      };

      io.to(`host-room-${accountId}`).emit('balloon-pop-trigger', result);
      io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', { prizes: state.prizes, popped: state.popped });
      console.log(`Direct pop from host: index ${index} on Account ${accountId}`);
    }
  });
});

server.listen(PORT, () => {
  console.log("==================================================");
  console.log("🎈 BALLOON POPPING GAME SERVER RUNNING 🎈");
  console.log(`- Local Host Screen: http://localhost:${PORT}`);
  console.log(`- Admin Screen:      http://localhost:${PORT}/admin.html`);
  console.log(`- Mobile Controller:  http://${LOCAL_IP}:${PORT}/mobile.html`);
  console.log("==================================================");
  console.log("Connect your mobile device to the same Wi-Fi and open the Mobile Controller URL.");
});
