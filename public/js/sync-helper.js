// Synchronization Helper for Balloon Popping Game
// Abstracts Socket.io and Firebase RTDB behind a unified interface to support local and Vercel serverless modes.

class BalloonSyncHelper {
  constructor() {
    this.mode = SYNC_CONFIG.mode;
    this.accountId = '1';
    this.room = '';
    this.socket = null;
    this.db = null;
    this.role = ''; // 'host', 'mobile', 'admin'
    this.socketId = 'device_' + Math.random().toString(36).substr(2, 9);
    
    // Handlers
    this.onStateUpdateCallback = null;
    this.onInitCallback = null;
    this.onMobileCountCallback = null;
    this.onResetCallback = null;
    this.onPopTriggerCallback = null; // Host/Mobile
    this.onMissTriggerCallback = null; // Host/Mobile
    this.onPrizeConfirmedCallback = null; // Sync Confirmations
    
    this.lastProcessedThrowTime = 0;
    this.lastProcessedResponseTime = 0;
    this.lastProcessedResetTime = 0;
    this.fallbackTimer = null;
  }

  init({ role, accountId, onInit, onStateUpdate, onReset, onPopTrigger, onMissTrigger, onMobileCount, onPrizeConfirmed }) {
    this.role = role;
    this.accountId = String(accountId || '1');
    this.room = getOrGenerateRoomId();
    this.onInitCallback = onInit;
    this.onStateUpdateCallback = onStateUpdate;
    this.onResetCallback = onReset;
    this.onPopTriggerCallback = onPopTrigger;
    this.onMissTriggerCallback = onMissTrigger;
    this.onMobileCountCallback = onMobileCount;
    this.onPrizeConfirmedCallback = onPrizeConfirmed;

    console.log(`[SyncHelper] Initializing in ${this.mode.toUpperCase()} mode for Account ${this.accountId}, Room ${this.room}`);

    if (this.mode === 'socket') {
      this._initSocket();
    } else {
      this._initFirebase();
    }
  }

  _initSocket() {
    if (typeof io === 'undefined') {
      console.warn("[SyncHelper] Socket.io library not loaded! Falling back to local sandbox.");
      this._fallbackToLocal("Socket.io library missing");
      return;
    }

    try {
      this.socket = io();

      this.socket.on('connect', () => {
        console.log(`[SyncHelper] Socket connected: ${this.socket.id}`);
        if (this.role === 'host') {
          this.socket.emit('join-host', { accountId: this.accountId });
        } else if (this.role === 'mobile') {
          this.socket.emit('join-mobile', { accountId: this.accountId });
        } else if (this.role === 'admin') {
          this.socket.emit('join-admin', { accountId: this.accountId });
        }
      });

      this.socket.on('connect_error', (err) => {
        console.warn("[SyncHelper] Socket connection failed, using local sandbox fallback:", err.message);
        this._fallbackToLocal("Socket connection failure");
      });

      this.socket.on('init-state', (data) => {
        if (this.onInitCallback) {
          this.onInitCallback(data);
        }
      });

      this.socket.on('state-updated', (data) => {
        if (this.onStateUpdateCallback) {
          this.onStateUpdateCallback(data);
        }
      });

      this.socket.on('board-reset', () => {
        if (this.onResetCallback) {
          this.onResetCallback();
        }
      });

      this.socket.on('balloon-pop-trigger', (data) => {
        if (this.onPopTriggerCallback) {
          this.onPopTriggerCallback(data);
        }
      });

      this.socket.on('balloon-miss-trigger', (data) => {
        if (this.onMissTriggerCallback) {
          this.onMissTriggerCallback(data);
        }
      });

      this.socket.on('mobile-connected', (data) => {
        if (this.onMobileCountCallback) {
          this.onMobileCountCallback(data.count);
        }
      });

      this.socket.on('mobile-disconnected', (data) => {
        if (this.onMobileCountCallback) {
          this.onMobileCountCallback(data.count);
        }
      });

      this.socket.on('prize-confirmed', () => {
        if (this.onPrizeConfirmedCallback) {
          this.onPrizeConfirmedCallback();
        }
      });
    } catch (e) {
      console.warn("[SyncHelper] Socket initialization error:", e);
      this._fallbackToLocal(e.message);
    }
  }

  _initFirebase() {
    if (typeof firebase === 'undefined') {
      console.warn("[SyncHelper] Firebase compatibility library not loaded! Falling back to local sandbox.");
      this._fallbackToLocal("Firebase library missing");
      return;
    }

    // Set a safety timeout of 3.5 seconds
    this.fallbackTimer = setTimeout(() => {
      console.warn("[SyncHelper] Firebase RTDB connection timed out (3.5s). Falling back to local sandbox storage.");
      this._fallbackToLocal("Firebase connection timeout (3.5s)");
    }, 3500);

    try {
      if (firebase.apps.length === 0) {
        firebase.initializeApp(SYNC_CONFIG.firebase);
      }

      this.db = firebase.database();
      
      // Hook up database connection state listener to trigger fallback immediately if disconnected/offline
      const connectedRef = this.db.ref(".info/connected");
      connectedRef.on("value", (snap) => {
        if (snap.val() === false) {
          console.log("[SyncHelper] Firebase reports disconnected state.");
        }
      });

      const accountRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}`);

      const defaultPrizes = [
        "스타벅스 커피", "문화상품권 1만원", "꽝 (아쉬워요!)", "치킨 쿠폰", "꽝 (아쉬워요!)",
        "꽝 (아쉬워요!)", "베스킨라빈스 싱글", "스타벅스 커피", "꽝 (아쉬워요!)", "문화상품권 1만원",
        "신세계 상품권 3만원", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)",
        "치킨 쿠폰", "꽝 (아쉬워요!)", "문화상품권 1만원", "꽝 (아쉬워요!)", "베스킨라빈스 싱글",
        "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "대박! 에어팟 프로"
      ];

      // Load or initialize Firebase state
      accountRef.child('state').once('value', (snapshot) => {
        if (this.fallbackTimer) {
          clearTimeout(this.fallbackTimer);
          this.fallbackTimer = null;
        }

        let state = snapshot.val();
        if (!state || !state.prizes || !state.popped) {
          state = {
            prizes: defaultPrizes,
            popped: Array(25).fill(false)
          };
          accountRef.child('state').set(state);
        }
        
        if (this.onInitCallback) {
          this.onInitCallback({
            prizes: state.prizes,
            popped: state.popped,
            mobileUrl: window.location.origin + `/mobile.html?room=${this.room}&account=${this.accountId}`
          });
        }
      }, (err) => {
        console.warn("[SyncHelper] Firebase read failed/permission denied:", err.message);
        if (this.fallbackTimer) {
          clearTimeout(this.fallbackTimer);
          this.fallbackTimer = null;
        }
        this._fallbackToLocal("Firebase read failure: " + err.message);
      });

      // Listen for state changes
      accountRef.child('state').on('value', (snapshot) => {
        const state = snapshot.val();
        if (state && this.onStateUpdateCallback) {
          this.onStateUpdateCallback(state);
        }
      });

      // Listen for confirm prize claims (dismiss overlay)
      accountRef.child('confirm_trigger').on('value', (snapshot) => {
        const val = snapshot.val();
        if (val && this.onPrizeConfirmedCallback) {
          this.onPrizeConfirmedCallback();
        }
      });

      // Presence connected tracker
      if (this.role === 'mobile') {
        const presenceRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/presence/${this.socketId}`);
        presenceRef.set(true);
        presenceRef.onDisconnect().remove();
      }

      // Host tracks mobile presence count & throw requests
      if (this.role === 'host') {
        const presenceRootRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/presence`);
        presenceRootRef.on('value', (snapshot) => {
          const presenceData = snapshot.val();
          const count = presenceData ? Object.keys(presenceData).length : 0;
          if (this.onMobileCountCallback) {
            this.onMobileCountCallback(count);
          }
        });

        // Host simulates and processes throw requests
        const throwReqRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/throw_request`);
        throwReqRef.on('value', (snapshot) => {
          const req = snapshot.val();
          if (req && req.timestamp > this.lastProcessedThrowTime) {
            this.lastProcessedThrowTime = req.timestamp;
            this._simulateFirebaseThrow(req);
          }
        });

        // Host listens to resets
        const resetRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/reset_trigger`);
        resetRef.on('value', (snapshot) => {
          const val = snapshot.val();
          if (val && val.timestamp > this.lastProcessedResetTime) {
            this.lastProcessedResetTime = val.timestamp;
            if (this.onResetCallback) {
              this.onResetCallback();
            }
          }
        });
      }

      // Mobile listens for throw responses & resets
      if (this.role === 'mobile') {
        const throwRespRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/throw_response`);
        throwRespRef.on('value', (snapshot) => {
          const resp = snapshot.val();
          if (resp && resp.timestamp > this.lastProcessedResponseTime) {
            this.lastProcessedResponseTime = resp.timestamp;
            if (this.onThrowResponseCallback) {
              this.onThrowResponseCallback(resp);
            }
          }
        });

        const resetRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/reset_trigger`);
        resetRef.on('value', (snapshot) => {
          const val = snapshot.val();
          if (val && val.timestamp > this.lastProcessedResetTime) {
            this.lastProcessedResetTime = val.timestamp;
            if (this.onResetCallback) {
              this.onResetCallback();
            }
          }
        });
      }
    } catch (e) {
      console.warn("[SyncHelper] Firebase initialization error:", e);
      if (this.fallbackTimer) {
        clearTimeout(this.fallbackTimer);
        this.fallbackTimer = null;
      }
      this._fallbackToLocal(e.message);
    }
  }

  // Local Sandbox Storage Fallback
  _fallbackToLocal(reason) {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    
    if (this.mode === 'local-fallback') return; // Already running in fallback
    
    this.mode = 'local-fallback';
    console.log(`[SyncHelper] Switch -> LOCAL OFFLINE SANDBOX mode. Reason: ${reason}`);

    // Broadcast a custom window event for Host / Mobile / Admin to show a beautiful user notice
    const event = new CustomEvent('sync-fallback-active', {
      detail: { reason: reason, databaseURL: SYNC_CONFIG.firebase.databaseURL }
    });
    window.dispatchEvent(event);

    const defaultPrizes = [
      "스타벅스 커피", "문화상품권 1만원", "꽝 (아쉬워요!)", "치킨 쿠폰", "꽝 (아쉬워요!)",
      "꽝 (아쉬워요!)", "베스킨라빈스 싱글", "스타벅스 커피", "꽝 (아쉬워요!)", "문화상품권 1만원",
      "신세계 상품권 3만원", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)",
      "치킨 쿠폰", "꽝 (아쉬워요!)", "문화상품권 1만원", "꽝 (아쉬워요!)", "베스킨라빈스 싱글",
      "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "대박! 에어팟 프로"
    ];

    const localKey = `balloon_state_acc_${this.accountId}`;
    let state = null;
    try {
      state = JSON.parse(localStorage.getItem(localKey));
    } catch (e) {}

    if (!state || !state.prizes || !state.popped) {
      state = {
        prizes: defaultPrizes,
        popped: Array(25).fill(false)
      };
      localStorage.setItem(localKey, JSON.stringify(state));
    }

    if (this.onInitCallback) {
      this.onInitCallback({
        prizes: state.prizes,
        popped: state.popped,
        mobileUrl: window.location.origin + `/mobile.html?room=${this.room}&account=${this.accountId}`
      });
    }
  }

  // Self-contained Serverless throw simulation inside Host's SyncHelper
  _simulateFirebaseThrow(req) {
    const accountRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}`);
    accountRef.child('state').once('value', (snapshot) => {
      const state = snapshot.val();
      if (!state) return;

      // Find unpopped balloons
      const unpoppedIndices = [];
      for (let i = 0; i < state.popped.length; i++) {
        if (!state.popped[i]) {
          unpoppedIndices.push(i);
        }
      }

      if (unpoppedIndices.length === 0) {
        this.respondToFirebaseThrow({
          status: 'error',
          message: '모든 풍선이 이미 터졌습니다!'
        });
        return;
      }

      // 15% miss rate or intensity too low
      const isMiss = (req.intensity < 0.6) || (Math.random() < 0.15);

      if (isMiss) {
        const randomIndex = unpoppedIndices[Math.floor(Math.random() * unpoppedIndices.length)];
        
        // Trigger visual miss on Host canvas
        if (this.onMissTriggerCallback) {
          this.onMissTriggerCallback({
            index: randomIndex,
            intensity: req.intensity || 1
          });
        }

        this.respondToFirebaseThrow({
          status: 'miss',
          index: randomIndex
        });
        return;
      }

      // Hit success!
      const randomIndex = unpoppedIndices[Math.floor(Math.random() * unpoppedIndices.length)];
      state.popped[randomIndex] = true;
      accountRef.child('state').set(state);

      // Trigger pop animation on Host canvas
      if (this.onPopTriggerCallback) {
        this.onPopTriggerCallback({
          index: randomIndex,
          prize: state.prizes[randomIndex],
          intensity: req.intensity || 1
        });
      }

      this.respondToFirebaseThrow({
        status: 'success',
        index: randomIndex,
        prize: state.prizes[randomIndex]
      });
    });
  }

  // Response helper
  respondToFirebaseThrow(result) {
    const throwRespRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/throw_response`);
    throwRespRef.set({
      ...result,
      timestamp: Date.now()
    });
  }

  // Confirm Prize Claim across all participants (Mobile result card + Host celebration card)
  confirmPrizeClaim() {
    if (this.mode === 'socket') {
      this.socket.emit('confirm-prize-claim');
    } else if (this.mode === 'local-fallback') {
      if (this.onPrizeConfirmedCallback) {
        this.onPrizeConfirmedCallback();
      }
    } else {
      const accountRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}`);
      accountRef.child('confirm_trigger').set({ timestamp: Date.now() });
    }
  }

  // --- ACTIONS ---

  // Admin / Host Resets the Board
  resetBoard(options = {}) {
    if (this.mode === 'socket') {
      this.socket.emit('admin-reset-board', options);
    } else if (this.mode === 'local-fallback') {
      const localKey = `balloon_state_acc_${this.accountId}`;
      let state = JSON.parse(localStorage.getItem(localKey)) || { prizes: [], popped: [] };
      state.popped = Array(25).fill(false);
      if (options.shuffle) {
        for (let i = state.prizes.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [state.prizes[i], state.prizes[j]] = [state.prizes[j], state.prizes[i]];
        }
      }
      localStorage.setItem(localKey, JSON.stringify(state));
      if (this.onStateUpdateCallback) this.onStateUpdateCallback(state);
      if (this.onResetCallback) this.onResetCallback();
    } else {
      const accountRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}`);
      accountRef.child('state').once('value', (snapshot) => {
        const state = snapshot.val();
        if (state) {
          state.popped = Array(25).fill(false);
          if (options.shuffle) {
            for (let i = state.prizes.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [state.prizes[i], state.prizes[j]] = [state.prizes[j], state.prizes[i]];
            }
          }
          accountRef.child('state').set(state);
          accountRef.child('reset_trigger').set({ timestamp: Date.now() });
        }
      });
    }
  }

  // Admin Toggles Pop status of single balloon
  togglePop(index) {
    if (this.mode === 'socket') {
      this.socket.emit('admin-toggle-pop', index);
    } else if (this.mode === 'local-fallback') {
      const localKey = `balloon_state_acc_${this.accountId}`;
      let state = JSON.parse(localStorage.getItem(localKey));
      if (state && state.popped) {
        state.popped[index] = !state.popped[index];
        localStorage.setItem(localKey, JSON.stringify(state));
        if (this.onStateUpdateCallback) this.onStateUpdateCallback(state);
      }
    } else {
      const stateRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/state`);
      stateRef.once('value', (snapshot) => {
        const state = snapshot.val();
        if (state && state.popped) {
          state.popped[index] = !state.popped[index];
          stateRef.set(state);
        }
      });
    }
  }

  // Direct Pop from Host Screen
  hostDirectPop(index) {
    if (this.mode === 'socket') {
      this.socket.emit('host-direct-pop', index);
    } else if (this.mode === 'local-fallback') {
      const localKey = `balloon_state_acc_${this.accountId}`;
      let state = JSON.parse(localStorage.getItem(localKey));
      if (state && !state.popped[index]) {
        state.popped[index] = true;
        localStorage.setItem(localKey, JSON.stringify(state));
        if (this.onStateUpdateCallback) this.onStateUpdateCallback(state);
        if (this.onPopTriggerCallback) {
          this.onPopTriggerCallback({
            index: index,
            prize: state.prizes[index],
            intensity: 1.0
          });
        }
      }
    } else {
      const accountRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}`);
      accountRef.child('state').once('value', (snapshot) => {
        const state = snapshot.val();
        if (state && !state.popped[index]) {
          state.popped[index] = true;
          accountRef.child('state').set(state);
          
          if (this.onPopTriggerCallback) {
            this.onPopTriggerCallback({
              index: index,
              prize: state.prizes[index],
              intensity: 1.0
            });
          }
        }
      });
    }
  }

  // Admin updates the entire prize board
  updatePrizes(updatedPrizes) {
    if (this.mode === 'socket') {
      this.socket.emit('admin-update-prizes', updatedPrizes);
    } else if (this.mode === 'local-fallback') {
      const localKey = `balloon_state_acc_${this.accountId}`;
      let state = JSON.parse(localStorage.getItem(localKey)) || { prizes: [], popped: [] };
      state.prizes = updatedPrizes;
      localStorage.setItem(localKey, JSON.stringify(state));
      if (this.onStateUpdateCallback) this.onStateUpdateCallback(state);
    } else {
      const stateRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/state`);
      stateRef.once('value', (snapshot) => {
        const state = snapshot.val();
        if (state) {
          state.prizes = updatedPrizes;
          stateRef.set(state);
        }
      });
    }
  }

  // Mobile controller throws dart
  throwDart(intensity, onResult) {
    if (this.mode === 'socket') {
      this.socket.emit('mobile-throw', { intensity: intensity });
      this.socket.once('throw-result', (data) => {
        onResult(data);
      });
    } else if (this.mode === 'local-fallback') {
      // Simulate physical dart throw inside local fallback sandbox!
      const localKey = `balloon_state_acc_${this.accountId}`;
      let state = JSON.parse(localStorage.getItem(localKey));
      if (!state) return;
      const unpopped = [];
      for (let i = 0; i < 25; i++) {
        if (!state.popped[i]) unpopped.push(i);
      }
      if (unpopped.length === 0) {
        onResult({ status: 'error', message: '모든 풍선이 이미 터졌습니다!' });
        return;
      }
      const isMiss = (intensity < 0.6) || (Math.random() < 0.15);
      const randomIndex = unpopped[Math.floor(Math.random() * unpopped.length)];
      if (isMiss) {
        onResult({ status: 'miss', index: randomIndex });
      } else {
        state.popped[randomIndex] = true;
        localStorage.setItem(localKey, JSON.stringify(state));
        if (this.onStateUpdateCallback) this.onStateUpdateCallback(state);
        onResult({ status: 'success', index: randomIndex, prize: state.prizes[randomIndex] });
      }
    } else {
      this.onThrowResponseCallback = (data) => {
        onResult(data);
      };
      const throwReqRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/throw_request`);
      throwReqRef.set({
        intensity: intensity,
        timestamp: Date.now()
      });
    }
  }
}

const SyncHelper = new BalloonSyncHelper();
