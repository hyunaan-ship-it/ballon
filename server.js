const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const WINNERS_FILE = path.join(__dirname, 'winners.json');

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
  "1": { prizes: [...defaultPrizes], popped: Array(25).fill(false), requireWinnerInfo: Array(25).fill(false), gridSize: 5 },
  "2": { prizes: [...defaultPrizes], popped: Array(25).fill(false), requireWinnerInfo: Array(25).fill(false), gridSize: 5 },
  "3": { prizes: [...defaultPrizes], popped: Array(25).fill(false), requireWinnerInfo: Array(25).fill(false), gridSize: 5 },
  "4": { prizes: [...defaultPrizes], popped: Array(25).fill(false), requireWinnerInfo: Array(25).fill(false), gridSize: 5 }
};

// Cooldown to prevent duplicate throw triggers on the server side
const lastSocketThrowTime = {};
const SERVER_THROW_COOLDOWN = 1800; // 1.8 seconds minimum between throws per socket

// Winners data structure
let winnersData = {
  "1": [],
  "2": [],
  "3": [],
  "4": []
};

// Load existing data if available
if (fs.existsSync(DATA_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // Auto-convert legacy single-account data if detected
    if (data.prizes && data.popped) {
      const size = data.gridSize || Math.sqrt(data.prizes.length) || 5;
      accountsState["1"] = {
        prizes: data.prizes,
        popped: data.popped,
        requireWinnerInfo: data.requireWinnerInfo || Array(data.prizes.length).fill(false),
        gridSize: size
      };
      console.log("Legacy game state successfully migrated to Account 1");
    } else {
      for (const id of ["1", "2", "3", "4"]) {
        if (data[id]) {
          const prizes = data[id].prizes || [...defaultPrizes];
          const size = data[id].gridSize || Math.sqrt(prizes.length) || 5;
          accountsState[id] = {
            prizes: prizes,
            popped: data[id].popped || Array(prizes.length).fill(false),
            requireWinnerInfo: data[id].requireWinnerInfo || Array(prizes.length).fill(false),
            gridSize: size
          };
        }
      }
      console.log("Game states for all accounts successfully loaded from data.json");
    }
  } catch (err) {
    console.error("Error loading data.json, using defaults:", err);
  }
}

// Load winners data if available
if (fs.existsSync(WINNERS_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(WINNERS_FILE, 'utf8'));
    for (const id of ["1", "2", "3", "4"]) {
      if (data[id]) {
        winnersData[id] = data[id] || [];
      }
    }
    console.log("Winners data successfully loaded from winners.json");
  } catch (err) {
    console.error("Error loading winners.json, using defaults:", err);
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

function saveWinnersData() {
  try {
    fs.writeFileSync(WINNERS_FILE, JSON.stringify(winnersData, null, 2), 'utf8');
  } catch (err) {
    console.error("Error saving winners data:", err);
  }
}

// Express middlewares to parse request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// API endpoint to get configuration (Supabase credentials) from environment variables
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || 'https://dmmgkrtxszjogdjhdwde.supabase.co',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || 'sb_publishable_kfpjWCVFzozRMGCIo1tPxg_59HRk81F'
  });
});

// API endpoint to get board state
app.get('/api/board-state/:accountId', (req, res) => {
  const accountId = req.params.accountId || '1';
  const state = accountsState[accountId];
  if (state) {
    const size = state.gridSize || Math.sqrt(state.prizes.length) || 5;
    res.json({
      prizes: state.prizes,
      popped: state.popped,
      requireWinnerInfo: state.requireWinnerInfo || Array(state.prizes.length).fill(false),
      gridSize: size
    });
  } else {
    res.status(404).json({ status: 'not_found' });
  }
});

// API endpoint to save board state
app.post('/api/board-state/:accountId', (req, res) => {
  const accountId = req.params.accountId || '1';
  const { prizes, popped, requireWinnerInfo, gridSize } = req.body;
  if (!prizes || !popped) {
    return res.status(400).json({ status: 'error', message: 'prizes and popped are required' });
  }
  
  accountsState[accountId] = {
    prizes: prizes,
    popped: popped,
    requireWinnerInfo: requireWinnerInfo || Array(prizes.length).fill(false),
    gridSize: gridSize || Math.sqrt(prizes.length) || 5
  };
  saveGameState();
  
  // Broadcast to other socket clients
  io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', accountsState[accountId]);
  
  res.json({ status: 'success' });
});

// API endpoint to submit winner info via POST
app.post('/api/winners/:accountId', (req, res) => {
  const accountId = req.params.accountId || '1';
  const { employeeId, phoneNumber, prize } = req.body;
  
  if (!employeeId || !phoneNumber || !prize) {
    return res.status(400).json({ status: 'error', message: '모든 필드를 입력해주세요.' });
  }

  const now = new Date();
  const kstFormatted = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  const winnerInfo = {
    employeeId,
    phoneNumber,
    prize,
    timestamp: now.toISOString(),
    timestampFormatted: kstFormatted
  };

  if (!winnersData[accountId]) {
    winnersData[accountId] = [];
  }
  winnersData[accountId].push(winnerInfo);
  saveWinnersData();

  console.log(`Winner info submitted via POST for Account ${accountId}:`, winnerInfo);
  
  // Notify admin room via socket if possible
  io.to(`admin-room-${accountId}`).emit('new-winner', winnerInfo);
  
  res.json({ status: 'success' });
});

// API endpoint to delete (clear) all winners for an account
app.delete('/api/winners/:accountId', (req, res) => {
  const accountId = req.params.accountId || '1';
  if (!winnersData[accountId]) {
    winnersData[accountId] = [];
  }
  winnersData[accountId] = [];
  saveWinnersData();
  console.log(`Winners data cleared for Account ${accountId}`);
  // Notify admin room
  io.to(`admin-room-${accountId}`).emit('winners-cleared');
  res.json({ status: 'success', message: '당첨자 기록이 삭제되었습니다.' });
});


// Phone number formatting helper to force 010-XXXX-XXXX format
function formatPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('10') && cleaned.length === 10) {
    cleaned = '0' + cleaned;
  }
  if (cleaned.length === 11) {
    return cleaned.slice(0, 3) + '-' + cleaned.slice(3, 7) + '-' + cleaned.slice(7);
  } else if (cleaned.length === 10) {
    return cleaned.slice(0, 3) + '-' + cleaned.slice(3, 6) + '-' + cleaned.slice(6);
  }
  return phone;
}

// API endpoint to get winners data
app.get('/api/winners/:accountId', (req, res) => {
  const accountId = req.params.accountId || '1';
  let winners = winnersData[accountId] || [];
  
  const { startDate, endDate } = req.query;
  if (startDate) {
    const startIso = startDate.includes('T') ? startDate : `${startDate}T00:00:00+09:00`;
    const start = new Date(startIso);
    winners = winners.filter(w => new Date(w.timestamp) >= start);
  }
  if (endDate) {
    const endIso = endDate.includes('T') ? endDate : `${endDate}T23:59:59.999+09:00`;
    const end = new Date(endIso);
    winners = winners.filter(w => new Date(w.timestamp) <= end);
  }
  
  res.json({ winners });
});

// API endpoint to download winners as CSV
app.get('/api/winners/:accountId/csv', (req, res) => {
  const accountId = req.params.accountId || '1';
  let winners = winnersData[accountId] || [];
  
  const { startDate, endDate } = req.query;
  if (startDate) {
    const startIso = startDate.includes('T') ? startDate : `${startDate}T00:00:00+09:00`;
    const start = new Date(startIso);
    winners = winners.filter(w => new Date(w.timestamp) >= start);
  }
  if (endDate) {
    const endIso = endDate.includes('T') ? endDate : `${endDate}T23:59:59.999+09:00`;
    const end = new Date(endIso);
    winners = winners.filter(w => new Date(w.timestamp) <= end);
  }
  
  if (winners.length === 0) {
    return res.status(404).send('해당 기간의 당첨자 정보가 없습니다.');
  }
  
  // Create CSV content
  const headers = ['사번', '전화번호', '상품명', '입력 시간'];
  const rows = winners.map(w => [w.employeeId, formatPhoneNumber(w.phoneNumber), w.prize, w.timestampFormatted]);
  const csvContent = [headers, ...rows].map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
  
  // Set response headers for CSV download
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=winners_account_${accountId}_${Date.now()}.csv`);
  
  // Add BOM for Excel UTF-8 compatibility
  const bom = '\uFEFF';
  res.send(bom + csvContent);
});

// Socket.io Real-Time Logic
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Host registers
  socket.on('join-host', (data = {}) => {
    const accountId = String(data.accountId || '1');
    socket.join(`host-room-${accountId}`);
    socket.accountId = accountId;
    console.log(`Host joined Account ${accountId}: ${socket.id}`);

    const state = accountsState[accountId] || { prizes: [...defaultPrizes], popped: Array(25).fill(false), requireWinnerInfo: Array(25).fill(false), gridSize: 5 };
    socket.emit('init-state', {
      popped: state.popped,
      prizes: state.prizes,
      requireWinnerInfo: state.requireWinnerInfo,
      gridSize: state.gridSize || 5,
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

    const state = accountsState[accountId] || { prizes: [...defaultPrizes], popped: Array(25).fill(false), requireWinnerInfo: Array(25).fill(false), gridSize: 5 };
    socket.emit('init-state', {
      popped: state.popped,
      prizes: state.prizes,
      requireWinnerInfo: state.requireWinnerInfo,
      gridSize: state.gridSize || 5,
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

    const state = accountsState[accountId] || { prizes: [...defaultPrizes], popped: Array(25).fill(false), requireWinnerInfo: Array(25).fill(false), gridSize: 5 };
    socket.emit('init-state', {
      popped: state.popped,
      prizes: state.prizes,
      requireWinnerInfo: state.requireWinnerInfo,
      gridSize: state.gridSize || 5,
      mobileUrl: `http://${LOCAL_IP}:${PORT}/mobile.html?account=${accountId}`,
      localIp: LOCAL_IP
    });
  });

  socket.on('disconnect', () => {
    const accountId = socket.accountId;
    console.log(`Socket disconnected: ${socket.id} (Account: ${accountId})`);
    delete lastSocketThrowTime[socket.id];
    if (accountId) {
      const activeMobiles = io.sockets.adapter.rooms.get(`mobile-room-${accountId}`)?.size || 0;
      io.to(`host-room-${accountId}`).emit('mobile-disconnected', { count: activeMobiles });
    }
  });

  // Admin saves updated prizes
  socket.on('admin-update-prizes', (updatedPrizes) => {
    const accountId = socket.accountId || '1';
    const state = accountsState[accountId];
    if (state && Array.isArray(updatedPrizes) && (updatedPrizes.length === 25 || updatedPrizes.length === 36)) {
      state.prizes = updatedPrizes;
      saveGameState();
      io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', { prizes: state.prizes, popped: state.popped, requireWinnerInfo: state.requireWinnerInfo, gridSize: state.gridSize });
      console.log(`Prizes updated by Admin for Account ${accountId}`);
    }
  });

  // Admin updates both prizes and settings at the same time
  socket.on('admin-update-prizes-and-settings', (data = {}) => {
    const accountId = String(data.accountId || socket.accountId || '1');
    const state = accountsState[accountId];
    if (state && data) {
      if (Array.isArray(data.prizes) && (data.prizes.length === 25 || data.prizes.length === 36)) {
        state.prizes = data.prizes;
        const size = data.prizes.length;
        state.gridSize = data.gridSize || Math.sqrt(size) || 5;

        // Resize popped array to match the size
        if (!state.popped) state.popped = [];
        if (state.popped.length < size) {
          while (state.popped.length < size) {
            state.popped.push(false);
          }
        } else if (state.popped.length > size) {
          state.popped = state.popped.slice(0, size);
        }
      }
      if (Array.isArray(data.requireWinnerInfo) && (data.requireWinnerInfo.length === 25 || data.requireWinnerInfo.length === 36)) {
        state.requireWinnerInfo = data.requireWinnerInfo;
      }
      saveGameState();
      io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', { 
        prizes: state.prizes, 
        popped: state.popped, 
        requireWinnerInfo: state.requireWinnerInfo,
        gridSize: state.gridSize
      });
      console.log(`Prizes, requireWinnerInfo, popped, and gridSize updated by Admin for Account ${accountId}`);
    }
  });

  // Admin changes grid size (5x5 or 6x6)
  socket.on('admin-change-grid-size', (size) => {
    const accountId = socket.accountId || '1';
    const state = accountsState[accountId];
    if (state && (size === 5 || size === 6)) {
      state.gridSize = size;
      const targetLen = size * size;
      
      // Resize arrays
      if (state.prizes.length < targetLen) {
        while (state.prizes.length < targetLen) {
          state.prizes.push("꽝 (아쉬워요!)");
          state.popped.push(false);
          state.requireWinnerInfo.push(false);
        }
      } else if (state.prizes.length > targetLen) {
        state.prizes = state.prizes.slice(0, targetLen);
        state.popped = state.popped.slice(0, targetLen);
        state.requireWinnerInfo = state.requireWinnerInfo.slice(0, targetLen);
      }
      
      saveGameState();
      io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', { 
        prizes: state.prizes, 
        popped: state.popped, 
        requireWinnerInfo: state.requireWinnerInfo,
        gridSize: state.gridSize
      });
      io.to(`host-room-${accountId}`).to(`mobile-room-${accountId}`).emit('board-reset');
      console.log(`Grid size updated to ${size}x${size} by Admin for Account ${accountId}`);
    }
  });

  // Admin resets the board
  socket.on('admin-reset-board', (options = {}) => {
    const accountId = String(options.accountId || socket.accountId || '1');
    if (!accountsState[accountId]) {
      accountsState[accountId] = { prizes: [...defaultPrizes], popped: Array(25).fill(false), requireWinnerInfo: Array(25).fill(false), gridSize: 5 };
    }
    const state = accountsState[accountId];
    state.popped = Array(state.prizes.length).fill(false);
    if (options.shuffle) {
      // Shuffle the prizes and requireWinnerInfo in tandem
      for (let i = state.prizes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.prizes[i], state.prizes[j]] = [state.prizes[j], state.prizes[i]];
        if (state.requireWinnerInfo && state.requireWinnerInfo.length === state.prizes.length) {
          [state.requireWinnerInfo[i], state.requireWinnerInfo[j]] = [state.requireWinnerInfo[j], state.requireWinnerInfo[i]];
        }
      }
      console.log(`Board reset and prizes shuffled for Account ${accountId}`);
    } else {
      console.log(`Board reset (prizes maintained) for Account ${accountId}`);
    }
    saveGameState();
    io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', accountsState[accountId]);
    io.to(`host-room-${accountId}`).to(`mobile-room-${accountId}`).emit('board-reset');
  });

  // Admin clears all board prizes/contents
  socket.on('admin-clear-all-prizes', (options = {}) => {
    const accountId = String((typeof options === 'object' && options.accountId) || socket.accountId || '1');
    if (!accountsState[accountId]) {
      accountsState[accountId] = { prizes: [...defaultPrizes], popped: Array(25).fill(false), requireWinnerInfo: Array(25).fill(false), gridSize: 5 };
    }
    const state = accountsState[accountId];
    const size = state.prizes.length || 25;
    state.prizes = Array(size).fill("");
    state.popped = Array(size).fill(false);
    state.requireWinnerInfo = Array(size).fill(false);
    saveGameState();
    io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', accountsState[accountId]);
    io.to(`host-room-${accountId}`).to(`mobile-room-${accountId}`).emit('board-reset');
    console.log(`All board contents cleared by Admin for Account ${accountId}`);
  });

  // Admin toggles balloon pop state directly
  socket.on('admin-toggle-pop', (data) => {
    const index = (typeof data === 'object') ? data.index : data;
    const accountId = String((typeof data === 'object' && data.accountId) || socket.accountId || '1');
    const state = accountsState[accountId];
    if (state && index >= 0 && index < state.prizes.length) {
      state.popped[index] = !state.popped[index];
      saveGameState();
      io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', { prizes: state.prizes, popped: state.popped, requireWinnerInfo: state.requireWinnerInfo, gridSize: state.gridSize });
      console.log(`Admin toggled popped state of index ${index} to ${state.popped[index]} for Account ${accountId}`);
    }
  });

  // Mobile player triggers a throw
  socket.on('mobile-throw', (data) => {
    const accountId = socket.accountId || '1';
    const state = accountsState[accountId];
    if (!state) return;

    // Server-side duplicate throw mitigation per socket
    const now = Date.now();
    const lastThrow = lastSocketThrowTime[socket.id] || 0;
    if (now - lastThrow < SERVER_THROW_COOLDOWN) {
      console.log(`[Server] Blocked duplicate throw request for Socket ${socket.id}. Time diff: ${now - lastThrow}ms`);
      return;
    }
    lastSocketThrowTime[socket.id] = now;

    console.log(`Dart thrown from mobile: ${socket.id} on Account ${accountId} with intensity:`, data.intensity || 1, 'tilt:', data.tilt);

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

    // Determine if it is a miss (intensity threshold)
    const isMiss = (data.intensity < 0.6) || (Math.random() < 0.15);
    const gridSize = state.gridSize || Math.sqrt(state.prizes.length) || 5;

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

    // Calculate target index based on tilt (if provided)
    let targetIndex;
    if (data.tilt && (data.tilt.x !== undefined || data.tilt.y !== undefined)) {
      // Map tilt to gridSize x gridSize grid
      const col = Math.max(0, Math.min(gridSize - 1, Math.floor(((data.tilt.x + 1) / 2) * gridSize)));
      const row = Math.max(0, Math.min(gridSize - 1, Math.floor(((data.tilt.y + 1) / 2) * gridSize)));
      
      // Find closest unpopped balloon using 2D distance
      let closestIndex = unpoppedIndices[0];
      let minDistanceSq = Infinity;
      
      for (const idx of unpoppedIndices) {
        const r = Math.floor(idx / gridSize);
        const c = idx % gridSize;
        // Make top-row balloons easier to hit by reducing the perceived vertical distance to them
        const rowDiff = row - r;
        const weightedRowDiff = r < 2 ? rowDiff * 0.5 : rowDiff;
        const distSq = Math.pow(weightedRowDiff, 2) + Math.pow(col - c, 2);
        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
          closestIndex = idx;
        }
      }
      targetIndex = closestIndex;
    } else {
      // Random selection if no tilt data
      targetIndex = unpoppedIndices[Math.floor(Math.random() * unpoppedIndices.length)];
    }

    state.popped[targetIndex] = true;
    saveGameState();

    const result = {
      index: targetIndex,
      prize: state.prizes[targetIndex],
      intensity: data.intensity || 1
    };

    // Broadcast to host (to trigger animation and show result)
    io.to(`host-room-${accountId}`).emit('balloon-pop-trigger', result);

    // Send back success to the mobile client
    socket.emit('throw-result', {
      status: 'success',
      index: targetIndex,
      prize: state.prizes[targetIndex],
      requireWinnerInfo: state.requireWinnerInfo[targetIndex]
    });

    // Sync state to all clients in this account
    io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', { prizes: state.prizes, popped: state.popped, requireWinnerInfo: state.requireWinnerInfo, gridSize: state.gridSize });
  });

  // Mobile/Host confirms prize claim (sync dismiss)
  socket.on('confirm-prize-claim', () => {
    const accountId = socket.accountId || '1';
    console.log(`Prize claim confirmed on Account ${accountId}`);
    io.to(`host-room-${accountId}`).to(`mobile-room-${accountId}`).to(`admin-room-${accountId}`).emit('prize-confirmed');
  });

  // Winner submits their information
  socket.on('submit-winner-info', (data) => {
    const accountId = socket.accountId || '1';
    const { employeeId, phoneNumber, prize } = data;
    
    if (!employeeId || !phoneNumber || !prize) {
      socket.emit('winner-info-result', { status: 'error', message: '모든 필드를 입력해주세요.' });
      return;
    }

    // Duplicate check globally across all accounts
    const cleanPhone = (p) => String(p).replace(/[^0-9]/g, '');
    let isDuplicate = false;
    for (const accId in winnersData) {
      if (winnersData[accId].some(
        w => (w.employeeId && w.employeeId.trim() === employeeId.trim()) || 
             (w.phoneNumber && cleanPhone(w.phoneNumber) === cleanPhone(phoneNumber))
      )) {
        isDuplicate = true;
        break;
      }
    }

    if (isDuplicate) {
      socket.emit('winner-info-result', { status: 'error', message: '이미 등록된 사번 또는 전화번호입니다. 중복 제출이 제한됩니다.' });
      return;
    }

    const now = new Date();
    const winnerInfo = {
      employeeId,
      phoneNumber,
      prize,
      timestamp: now.toISOString(),
      timestampFormatted: now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
    };

    winnersData[accountId].push(winnerInfo);
    saveWinnersData();

    console.log(`Winner info submitted for Account ${accountId}:`, winnerInfo);
    socket.emit('winner-info-result', { status: 'success' });
    
    // Notify admin room about new winner
    io.to(`admin-room-${accountId}`).emit('new-winner', winnerInfo);
  });

  // Direct pop from Host (click balloon directly as fallback)
  socket.on('host-direct-pop', (index) => {
    const accountId = socket.accountId || '1';
    const state = accountsState[accountId];
    if (state && index >= 0 && index < state.prizes.length && !state.popped[index]) {
      state.popped[index] = true;
      saveGameState();

      const result = {
        index: index,
        prize: state.prizes[index],
        intensity: 1.0
      };

      io.to(`host-room-${accountId}`).emit('balloon-pop-trigger', result);
      io.to(`host-room-${accountId}`).to(`admin-room-${accountId}`).to(`mobile-room-${accountId}`).emit('state-updated', { prizes: state.prizes, popped: state.popped, requireWinnerInfo: state.requireWinnerInfo, gridSize: state.gridSize });
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
