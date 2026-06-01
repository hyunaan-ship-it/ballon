// Synchronization Helper for Balloon Popping Game
// Abstracts Socket.io, Firebase RTDB, and Supabase Realtime Broadcast behind a unified interface to support local, serverless, and peer-to-peer modes.

class BalloonSyncHelper {
  constructor() {
    this.mode = SYNC_CONFIG.mode;
    this.accountId = '1';
    this.room = '';
    this.socket = null;
    this.db = null; // Used for Firebase or Supabase client
    this.channel = null; // Used for Supabase Realtime channel
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
    } else if (this.mode === 'supabase') {
      this._initSupabase();
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

      // Listen for confirm prize claims
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

        // Host processes throw requests
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

  // --- SUPABASE REALTIME (BROADCAST & PRESENCE MODE) ---
  _initSupabase() {
    if (typeof supabase === 'undefined') {
      console.log("[SyncHelper] Dynamically loading Supabase JS SDK CDN...");
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = () => {
        this._setupSupabaseClient();
      };
      script.onerror = () => {
        console.warn("[SyncHelper] Failed to load Supabase SDK! Falling back to local sandbox.");
        this._fallbackToLocal("Supabase SDK load failure");
      };
      document.head.appendChild(script);
    } else {
      this._setupSupabaseClient();
    }
  }

  _setupSupabaseClient() {
    if (!SYNC_CONFIG.supabase || !SYNC_CONFIG.supabase.url || !SYNC_CONFIG.supabase.anonKey || SYNC_CONFIG.supabase.url.includes('your-supabase')) {
      console.warn("[SyncHelper] Supabase credentials not configured! Falling back to local sandbox.");
      this._fallbackToLocal("Supabase credentials missing or placeholder");
      return;
    }

    // Set safety response timeout for Mobile/Admin clients to detect if Host is open
    if (this.role !== 'host') {
      this.fallbackTimer = setTimeout(() => {
        console.warn("[SyncHelper] Supabase Host response timed out (3.5s). Falling back to local sandbox.");
        this._fallbackToLocal("Supabase Host connection timeout (3.5s)");
      }, 3500);
    }

    try {
      this.db = supabase.createClient(SYNC_CONFIG.supabase.url, SYNC_CONFIG.supabase.anonKey);
      
      const channelName = `balloon-sync-room-${this.room}-acc-${this.accountId}`;
      this.channel = this.db.channel(channelName, {
        config: {
          broadcast: { self: true },
          presence: { key: this.socketId }
        }
      });

      const defaultPrizes = [
        "스타벅스 커피", "문화상품권 1만원", "꽝 (아쉬워요!)", "치킨 쿠폰", "꽝 (아쉬워요!)",
        "꽝 (아쉬워요!)", "베스킨라빈스 싱글", "스타벅스 커피", "꽝 (아쉬워요!)", "문화상품권 1만원",
        "신세계 상품권 3만원", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)",
        "치킨 쿠폰", "꽝 (아쉬워요!)", "문화상품권 1만원", "꽝 (아쉬워요!)", "베스킨라빈스 싱글",
        "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "대박! 에어팟 프로"
      ];

      // Broadcast Listener Registrations
      this.channel
        .on('broadcast', { event: 'request-init' }, ({ payload }) => {
          if (this.role === 'host') {
            console.log(`[Supabase] Host received request-init from mobile client.`);
            const localKey = `balloon_state_acc_${this.accountId}`;
            let state = JSON.parse(localStorage.getItem(localKey)) || {
              prizes: defaultPrizes,
              popped: Array(25).fill(false)
            };
            this.channel.send({
              type: 'broadcast',
              event: 'init-state',
              payload: {
                prizes: state.prizes,
                popped: state.popped,
                mobileUrl: window.location.origin + `/mobile.html?room=${this.room}&account=${this.accountId}`
              }
            });
          }
        })
        .on('broadcast', { event: 'init-state' }, ({ payload }) => {
          if (this.role !== 'host') {
            console.log("[Supabase] Client received init-state from Host.");
            if (this.fallbackTimer) {
              clearTimeout(this.fallbackTimer);
              this.fallbackTimer = null;
            }
            if (this.onInitCallback) {
              this.onInitCallback(payload);
            }
          }
        })
        .on('broadcast', { event: 'state-updated' }, ({ payload }) => {
          console.log("[Supabase] State update broadcast received:", payload);
          if (this.onStateUpdateCallback) {
            this.onStateUpdateCallback(payload);
          }
        })
        .on('broadcast', { event: 'balloon-pop-trigger' }, ({ payload }) => {
          console.log("[Supabase] Pop trigger broadcast received:", payload);
          if (this.onPopTriggerCallback) {
            this.onPopTriggerCallback(payload);
          }
        })
        .on('broadcast', { event: 'balloon-miss-trigger' }, ({ payload }) => {
          console.log("[Supabase] Miss trigger broadcast received:", payload);
          if (this.onMissTriggerCallback) {
            this.onMissTriggerCallback(payload);
          }
        })
        .on('broadcast', { event: 'board-reset' }, () => {
          console.log("[Supabase] Reset board broadcast received.");
          if (this.onResetCallback) {
            this.onResetCallback();
          }
        })
        .on('broadcast', { event: 'prize-confirmed' }, () => {
          console.log("[Supabase] Prize confirmation overlay trigger received.");
          if (this.onPrizeConfirmedCallback) {
            this.onPrizeConfirmedCallback();
          }
        })
        .on('broadcast', { event: 'throw-request' }, ({ payload }) => {
          if (this.role === 'host') {
            console.log("[Supabase] Host received throw request:", payload);
            this._handleSupabaseThrow(payload);
          }
        })
        .on('broadcast', { event: 'throw-response' }, ({ payload }) => {
          if (this.role === 'mobile') {
            console.log("[Supabase] Mobile received throw response:", payload);
            if (this.onThrowResponseCallback) {
              this.onThrowResponseCallback(payload);
            }
          }
        });

      // Presence Tracker
      this.channel
        .on('presence', { event: 'sync' }, () => {
          const presenceState = this.channel.presenceState();
          let count = 0;
          Object.keys(presenceState).forEach((key) => {
            const presences = presenceState[key];
            if (presences && presences[0] && presences[0].role === 'mobile') {
              count++;
            }
          });
          if (this.onMobileCountCallback) {
            this.onMobileCountCallback(count);
          }
        });

      // Subscribe and Track Role
      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[SyncHelper] Supabase Realtime subscribed in role: ${this.role}`);
          await this.channel.track({ role: this.role });

          if (this.role === 'host') {
            const localKey = `balloon_state_acc_${this.accountId}`;
            let state = JSON.parse(localStorage.getItem(localKey)) || {
              prizes: defaultPrizes,
              popped: Array(25).fill(false)
            };
            localStorage.setItem(localKey, JSON.stringify(state));

            if (this.onInitCallback) {
              this.onInitCallback({
                prizes: state.prizes,
                popped: state.popped,
                mobileUrl: window.location.origin + `/mobile.html?room=${this.room}&account=${this.accountId}`
              });
            }
          } else {
            // Send join init-request
            this.channel.send({
              type: 'broadcast',
              event: 'request-init',
              payload: { role: this.role }
            });
          }
        } else {
          console.warn("[SyncHelper] Supabase channel subscribe failure:", status);
          if (status !== 'TIMED_OUT') {
            this._fallbackToLocal("Supabase subscribe: " + status);
          }
        }
      });

    } catch (e) {
      console.warn("[SyncHelper] Supabase client creation failed:", e);
      this._fallbackToLocal(e.message);
    }
  }

  // Host processes peer throw inside Broadcast engine
  _handleSupabaseThrow(req) {
    const localKey = `balloon_state_acc_${this.accountId}`;
    let state = JSON.parse(localStorage.getItem(localKey));
    if (!state) return;

    const unpoppedIndices = [];
    for (let i = 0; i < state.popped.length; i++) {
      if (!state.popped[i]) unpoppedIndices.push(i);
    }

    if (unpoppedIndices.length === 0) {
      this.channel.send({
        type: 'broadcast',
        event: 'throw-response',
        payload: { status: 'error', message: '모든 풍선이 이미 터졌습니다!' }
      });
      return;
    }

    const isMiss = (req.intensity < 0.6) || (Math.random() < 0.15);
    const randomIndex = unpoppedIndices[Math.floor(Math.random() * unpoppedIndices.length)];

    if (isMiss) {
      if (this.onMissTriggerCallback) {
        this.onMissTriggerCallback({
          index: randomIndex,
          intensity: req.intensity || 1
        });
      }

      this.channel.send({
        type: 'broadcast',
        event: 'balloon-miss-trigger',
        payload: { index: randomIndex, intensity: req.intensity || 1 }
      });

      this.channel.send({
        type: 'broadcast',
        event: 'throw-response',
        payload: { status: 'miss', index: randomIndex }
      });
      return;
    }

    // Success Hit!
    state.popped[randomIndex] = true;
    localStorage.setItem(localKey, JSON.stringify(state));

    // Broadcast new popped state
    this.channel.send({
      type: 'broadcast',
      event: 'state-updated',
      payload: state
    });

    if (this.onPopTriggerCallback) {
      this.onPopTriggerCallback({
        index: randomIndex,
        prize: state.prizes[randomIndex],
        intensity: req.intensity || 1
      });
    }

    this.channel.send({
      type: 'broadcast',
      event: 'balloon-pop-trigger',
      payload: {
        index: randomIndex,
        prize: state.prizes[randomIndex],
        intensity: req.intensity || 1
      }
    });

    this.channel.send({
      type: 'broadcast',
      event: 'throw-response',
      payload: {
        status: 'success',
        index: randomIndex,
        prize: state.prizes[randomIndex]
      }
    });
  }

  // --- LOCAL FALLBACK ---
  _fallbackToLocal(reason) {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    
    if (this.mode === 'local-fallback') return;
    
    this.mode = 'local-fallback';
    console.log(`[SyncHelper] Switch -> LOCAL OFFLINE SANDBOX mode. Reason: ${reason}`);

    const event = new CustomEvent('sync-fallback-active', {
      detail: { 
        reason: reason, 
        targetMode: SYNC_CONFIG.mode, 
        databaseURL: SYNC_CONFIG.firebase.databaseURL,
        supabaseURL: SYNC_CONFIG.supabase ? SYNC_CONFIG.supabase.url : ''
      }
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

  // --- HELPER WRITERS ---
  _simulateFirebaseThrow(req) {
    const accountRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}`);
    accountRef.child('state').once('value', (snapshot) => {
      const state = snapshot.val();
      if (!state) return;

      const unpoppedIndices = [];
      for (let i = 0; i < state.popped.length; i++) {
        if (!state.popped[i]) unpoppedIndices.push(i);
      }

      if (unpoppedIndices.length === 0) {
        this.respondToFirebaseThrow({ status: 'error', message: '모든 풍선이 이미 터졌습니다!' });
        return;
      }

      const isMiss = (req.intensity < 0.6) || (Math.random() < 0.15);
      const randomIndex = unpoppedIndices[Math.floor(Math.random() * unpoppedIndices.length)];

      if (isMiss) {
        if (this.onMissTriggerCallback) {
          this.onMissTriggerCallback({ index: randomIndex, intensity: req.intensity || 1 });
        }
        this.respondToFirebaseThrow({ status: 'miss', index: randomIndex });
        return;
      }

      state.popped[randomIndex] = true;
      accountRef.child('state').set(state);

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

  respondToFirebaseThrow(result) {
    const throwRespRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/throw_response`);
    throwRespRef.set({
      ...result,
      timestamp: Date.now()
    });
  }

  confirmPrizeClaim() {
    if (this.mode === 'socket') {
      this.socket.emit('confirm-prize-claim');
    } else if (this.mode === 'local-fallback') {
      if (this.onPrizeConfirmedCallback) this.onPrizeConfirmedCallback();
    } else if (this.mode === 'supabase') {
      this.channel.send({
        type: 'broadcast',
        event: 'prize-confirmed',
        payload: {}
      });
    } else {
      const accountRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}`);
      accountRef.child('confirm_trigger').set({ timestamp: Date.now() });
    }
  }

  resetBoard(options = {}) {
    if (this.mode === 'socket') {
      this.socket.emit('admin-reset-board', options);
    } else if (this.mode === 'local-fallback' || this.mode === 'supabase') {
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
      
      if (this.mode === 'supabase') {
        this.channel.send({
          type: 'broadcast',
          event: 'state-updated',
          payload: state
        });
        this.channel.send({
          type: 'broadcast',
          event: 'board-reset',
          payload: {}
        });
      } else {
        if (this.onStateUpdateCallback) this.onStateUpdateCallback(state);
        if (this.onResetCallback) this.onResetCallback();
      }
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

  togglePop(index) {
    if (this.mode === 'socket') {
      this.socket.emit('admin-toggle-pop', index);
    } else if (this.mode === 'local-fallback' || this.mode === 'supabase') {
      const localKey = `balloon_state_acc_${this.accountId}`;
      let state = JSON.parse(localStorage.getItem(localKey));
      if (state && state.popped) {
        state.popped[index] = !state.popped[index];
        localStorage.setItem(localKey, JSON.stringify(state));
        
        if (this.mode === 'supabase') {
          this.channel.send({
            type: 'broadcast',
            event: 'state-updated',
            payload: state
          });
        } else {
          if (this.onStateUpdateCallback) this.onStateUpdateCallback(state);
        }
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

  hostDirectPop(index) {
    if (this.mode === 'socket') {
      this.socket.emit('host-direct-pop', index);
    } else if (this.mode === 'local-fallback' || this.mode === 'supabase') {
      const localKey = `balloon_state_acc_${this.accountId}`;
      let state = JSON.parse(localStorage.getItem(localKey));
      if (state && !state.popped[index]) {
        state.popped[index] = true;
        localStorage.setItem(localKey, JSON.stringify(state));
        
        if (this.mode === 'supabase') {
          this.channel.send({
            type: 'broadcast',
            event: 'state-updated',
            payload: state
          });
          this.channel.send({
            type: 'broadcast',
            event: 'balloon-pop-trigger',
            payload: { index: index, prize: state.prizes[index], intensity: 1.0 }
          });
        } else {
          if (this.onStateUpdateCallback) this.onStateUpdateCallback(state);
          if (this.onPopTriggerCallback) {
            this.onPopTriggerCallback({ index: index, prize: state.prizes[index], intensity: 1.0 });
          }
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

  updatePrizes(updatedPrizes) {
    if (this.mode === 'socket') {
      this.socket.emit('admin-update-prizes', updatedPrizes);
    } else if (this.mode === 'local-fallback' || this.mode === 'supabase') {
      const localKey = `balloon_state_acc_${this.accountId}`;
      let state = JSON.parse(localStorage.getItem(localKey)) || { prizes: [], popped: [] };
      state.prizes = updatedPrizes;
      localStorage.setItem(localKey, JSON.stringify(state));
      
      if (this.mode === 'supabase') {
        this.channel.send({
          type: 'broadcast',
          event: 'state-updated',
          payload: state
        });
      } else {
        if (this.onStateUpdateCallback) this.onStateUpdateCallback(state);
      }
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

  throwDart(intensity, onResult) {
    if (this.mode === 'socket') {
      this.socket.emit('mobile-throw', { intensity: intensity });
      this.socket.once('throw-result', (data) => {
        onResult(data);
      });
    } else if (this.mode === 'local-fallback') {
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
    } else if (this.mode === 'supabase') {
      this.onThrowResponseCallback = (data) => {
        onResult(data);
      };
      this.channel.send({
        type: 'broadcast',
        event: 'throw-request',
        payload: { intensity: intensity }
      });
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
