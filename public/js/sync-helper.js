// Synchronization Helper for Balloon Popping Game
// Abstracts Socket.io, Firebase RTDB, and Supabase Realtime Broadcast behind a unified interface to support local, serverless, and peer-to-peer modes.

function parsePrize(prizeStr) {
  if (typeof prizeStr === 'string' && prizeStr.startsWith('{')) {
    try {
      const parsed = JSON.parse(prizeStr);
      if (parsed && (parsed.text !== undefined || parsed.image !== undefined)) {
        return { text: parsed.text || '', image: parsed.image || '' };
      }
    } catch (e) {}
  }
  return { text: prizeStr || '', image: '' };
}

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

    // In-memory winners store: accumulates all winners received during this session.
    // Used as the source of truth in supabase/fallback modes since localStorage
    // is per-browser and cannot be shared between mobile and admin devices.
    this._winnersStore = [];
    this._winnersStoreLoaded = false;
  }

  init({ role, accountId, onInit, onStateUpdate, onReset, onPopTrigger, onMissTrigger, onMobileCount, onPrizeConfirmed, onNewWinner, onWinnersCleared, onDisconnect, onConnect }) {
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
    this.onNewWinnerCallback = onNewWinner;
    this.onWinnersClearedCallback = onWinnersCleared || null;
    this.onDisconnectCallback = onDisconnect || null;
    this.onConnectCallback = onConnect || null;

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
        // If we were in fallback mode, restore socket mode!
        if (this.mode === 'local-fallback' && SYNC_CONFIG.mode === 'socket') {
          this.mode = 'socket';
          console.log("[SyncHelper] Socket reconnected! Restoring socket mode.");
        }
        if (this.onConnectCallback) {
          this.onConnectCallback();
        }
        if (this.role === 'host') {
          this.socket.emit('join-host', { accountId: this.accountId });
        } else if (this.role === 'mobile') {
          this.socket.emit('join-mobile', { accountId: this.accountId });
        } else if (this.role === 'admin') {
          this.socket.emit('join-admin', { accountId: this.accountId });
        }
      });

      this.socket.on('disconnect', (reason) => {
        console.warn(`[SyncHelper] Socket disconnected: ${reason}`);
        if (this.onDisconnectCallback) {
          this.onDisconnectCallback(reason);
        }
      });

      this.socket.on('connect_error', (err) => {
        console.warn("[SyncHelper] Socket connection failed (retrying in background):", err.message);
        if (this.onDisconnectCallback) {
          this.onDisconnectCallback('connect_error');
        }
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

      this.socket.on('new-winner', (winnerInfo) => {
        if (this.onNewWinnerCallback) {
          this.onNewWinnerCallback(winnerInfo);
        }
      });

      this.socket.on('winners-cleared', () => {
        // Clear in-memory store when server broadcasts that winners were cleared
        this._winnersStore = [];
        this._winnersStoreLoaded = true;
        if (this.onWinnersClearedCallback) {
          this.onWinnersClearedCallback();
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

    // Set a safety timeout of 12 seconds (provides enough time for iOS permission dialog and cold starts)
    this.fallbackTimer = setTimeout(() => {
      console.warn("[SyncHelper] Firebase RTDB connection timed out (12s). Falling back to local sandbox storage.");
      this._fallbackToLocal("Firebase connection timeout (12s)");
    }, 12000);

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
            popped: Array(25).fill(false),
            requireWinnerInfo: Array(25).fill(false)
          };
          accountRef.child('state').set(state);
        } else if (!state.requireWinnerInfo) {
          state.requireWinnerInfo = Array(25).fill(false);
          accountRef.child('state').set(state);
        }
        
        if (this.onInitCallback) {
          this.onInitCallback({
            prizes: state.prizes,
            popped: state.popped,
            requireWinnerInfo: state.requireWinnerInfo || Array(25).fill(false),
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
            if (resp.socketId === this.socketId) {
              this.lastProcessedResponseTime = resp.timestamp;
              if (this.onThrowResponseCallback) {
                this.onThrowResponseCallback(resp);
              }
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

      // Track winners in Firebase Realtime Database
      const winnersRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/winners`);
      winnersRef.on('child_added', (snapshot) => {
        const val = snapshot.val();
        if (val && this.onNewWinnerCallback) {
          this.onNewWinnerCallback(val);
        }
      });
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

  async _setupSupabaseClient() {
    try {
      const configRes = await fetch('/api/config').catch(() => null);
      if (configRes && configRes.ok) {
        const configData = await configRes.json();
        if (configData.supabaseUrl && configData.supabaseAnonKey) {
          SYNC_CONFIG.supabase.url = configData.supabaseUrl;
          SYNC_CONFIG.supabase.anonKey = configData.supabaseAnonKey;
          console.log("[SyncHelper] Loaded dynamic Supabase config from server:", SYNC_CONFIG.supabase.url);
        }
      }
    } catch (err) {
      console.warn("[SyncHelper] Failed to fetch server config, using local defaults:", err);
    }

    if (!SYNC_CONFIG.supabase || !SYNC_CONFIG.supabase.url || !SYNC_CONFIG.supabase.anonKey || SYNC_CONFIG.supabase.url.includes('your-supabase')) {
      console.warn("[SyncHelper] Supabase credentials not configured! Falling back to local sandbox.");
      this._fallbackToLocal("Supabase credentials missing or placeholder");
      return;
    }

    // Set safety response timeout for Mobile/Admin clients to detect if Host is open (12 seconds to accommodate iOS permission prompt)
    if (this.role !== 'host') {
      this.fallbackTimer = setTimeout(() => {
        console.warn("[SyncHelper] Supabase Host response timed out (12s). Falling back to local sandbox.");
        this._fallbackToLocal("Supabase Host connection timeout (12s)");
      }, 12000);
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
              popped: Array(25).fill(false),
              requireWinnerInfo: Array(25).fill(false)
            };
            if (!state.requireWinnerInfo) {
              state.requireWinnerInfo = Array(25).fill(false);
              localStorage.setItem(localKey, JSON.stringify(state));
            }
            this.channel.send({
              type: 'broadcast',
              event: 'init-state',
              payload: {
                prizes: state.prizes,
                popped: state.popped,
                requireWinnerInfo: state.requireWinnerInfo,
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
            if (payload) {
              try {
                if (typeof payload.prizes === 'string') payload.prizes = JSON.parse(payload.prizes);
                if (typeof payload.popped === 'string') payload.popped = JSON.parse(payload.popped);
                if (typeof payload.requireWinnerInfo === 'string') payload.requireWinnerInfo = JSON.parse(payload.requireWinnerInfo);
              } catch (e) {
                console.warn("[SyncHelper] Failed to parse init payload:", e);
              }
              const localKey = `balloon_state_acc_${this.accountId}`;
              localStorage.setItem(localKey, JSON.stringify(payload));
            }
            if (this.onInitCallback) {
              this.onInitCallback(payload);
            }
          }
        })
        .on('broadcast', { event: 'state-updated' }, ({ payload }) => {
          console.log("[Supabase] State update broadcast received:", payload);
          if (payload) {
            try {
              if (typeof payload.prizes === 'string') payload.prizes = JSON.parse(payload.prizes);
              if (typeof payload.popped === 'string') payload.popped = JSON.parse(payload.popped);
              if (typeof payload.requireWinnerInfo === 'string') payload.requireWinnerInfo = JSON.parse(payload.requireWinnerInfo);
            } catch (e) {
              console.warn("[SyncHelper] Failed to parse broadcast payload:", e);
            }
            const localKey = `balloon_state_acc_${this.accountId}`;
            localStorage.setItem(localKey, JSON.stringify(payload));
          }
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
            if (payload && payload.socketId === this.socketId) {
              if (this.onThrowResponseCallback) {
                this.onThrowResponseCallback(payload);
              }
            }
          }
        })
        .on('broadcast', { event: 'new-winner-broadcast' }, ({ payload }) => {
          // Update in-memory store (works across all devices receiving the broadcast)
          if (!this._winnersStoreLoaded) {
            this._winnersStoreLoaded = true;
          }
          // Avoid duplicates (self-receive due to broadcast: { self: true })
          const alreadyExists = this._winnersStore.some(
            w => w.employeeId === payload.employeeId && w.timestamp === payload.timestamp
          );
          if (!alreadyExists) {
            this._winnersStore.push(payload);
          }
          // Also persist to localStorage as backup
          const localKey = `winners_list_acc_${this.accountId}`;
          const list = JSON.parse(localStorage.getItem(localKey)) || [];
          const existsInLocal = list.some(
            w => w.employeeId === payload.employeeId && w.timestamp === payload.timestamp
          );
          if (!existsInLocal) {
            list.push(payload);
            localStorage.setItem(localKey, JSON.stringify(list));
          }
          
          if (this.onNewWinnerCallback) {
            this.onNewWinnerCallback(payload);
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

          // Try to load state from API first
          let apiLoadedState = null;
          let apiStatus = null;
          try {
            const res = await fetch(`/api/board-state/${this.accountId}`);
            apiStatus = res.status;
            if (res.ok) {
              const data = await res.json();
              if (data && data.prizes && data.popped) {
                let parsedPrizes = data.prizes;
                let parsedPopped = data.popped;
                let parsedRequire = data.requireWinnerInfo || Array(parsedPrizes.length).fill(false);
                try {
                  if (typeof parsedPrizes === 'string') parsedPrizes = JSON.parse(parsedPrizes);
                  if (typeof parsedPopped === 'string') parsedPopped = JSON.parse(parsedPopped);
                  if (typeof parsedRequire === 'string') parsedRequire = JSON.parse(parsedRequire);
                } catch (e) {
                  console.warn("[SyncHelper] Failed to parse apiLoadedState fields:", e);
                }
                apiLoadedState = {
                  prizes: parsedPrizes,
                  popped: parsedPopped,
                  requireWinnerInfo: parsedRequire
                };
                console.log(`[SyncHelper] Successfully loaded board state from database for Account ${this.accountId}`);
              }
            }
          } catch (err) {
            console.warn("[SyncHelper] Failed to fetch board state from API:", err);
          }

          if (apiStatus === 200 || apiStatus === 404) {
            // API connection is functional. Clear safety timeout immediately to prevent local fallback.
            if (this.fallbackTimer) {
              clearTimeout(this.fallbackTimer);
              this.fallbackTimer = null;
            }
          }

          if (apiLoadedState) {
            const localKey = `balloon_state_acc_${this.accountId}`;
            localStorage.setItem(localKey, JSON.stringify(apiLoadedState));

            if (this.onInitCallback) {
              this.onInitCallback({
                prizes: apiLoadedState.prizes,
                popped: apiLoadedState.popped,
                requireWinnerInfo: apiLoadedState.requireWinnerInfo,
                mobileUrl: window.location.origin + `/mobile.html?room=${this.room}&account=${this.accountId}`
              });
            }
          } else if (apiStatus === 404) {
            // Database is online, but no board state is saved yet.
            // Let's initialize with default/local state and save it to the DB.
            const localKey = `balloon_state_acc_${this.accountId}`;
            let state = JSON.parse(localStorage.getItem(localKey)) || {
              prizes: defaultPrizes,
              popped: Array(25).fill(false),
              requireWinnerInfo: Array(25).fill(false),
              gridSize: 5
            };
            if (!state.requireWinnerInfo) {
              state.requireWinnerInfo = Array(state.prizes.length).fill(false);
            }
            localStorage.setItem(localKey, JSON.stringify(state));

            // Write initial state to database
            fetch(`/api/board-state/${this.accountId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(state)
            }).catch(err => console.warn("[SyncHelper] Failed to initialize board state in DB:", err));

            if (this.onInitCallback) {
              this.onInitCallback({
                prizes: state.prizes,
                popped: state.popped,
                requireWinnerInfo: state.requireWinnerInfo,
                mobileUrl: window.location.origin + `/mobile.html?room=${this.room}&account=${this.accountId}`
              });
            }
          } else {
            // API request failed or returned other error. Fall back to old local/broadcast logic
            if (this.role === 'host') {
              const localKey = `balloon_state_acc_${this.accountId}`;
              let state = JSON.parse(localStorage.getItem(localKey)) || {
                prizes: defaultPrizes,
                popped: Array(25).fill(false),
                requireWinnerInfo: Array(25).fill(false),
                gridSize: 5
              };
              if (!state.requireWinnerInfo) {
                state.requireWinnerInfo = Array(state.prizes.length).fill(false);
              }
              localStorage.setItem(localKey, JSON.stringify(state));

              if (this.onInitCallback) {
                this.onInitCallback({
                  prizes: state.prizes,
                  popped: state.popped,
                  requireWinnerInfo: state.requireWinnerInfo,
                  mobileUrl: window.location.origin + `/mobile.html?room=${this.room}&account=${this.accountId}`
                });
              }
            } else {
              // Send join init-request to host
              this.channel.send({
                type: 'broadcast',
                event: 'request-init',
                payload: { role: this.role }
              });
            }
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

  async _saveBoardStateSupabase(state) {
    if (this.mode !== 'supabase') return;
    try {
      await fetch(`/api/board-state/${this.accountId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prizes: state.prizes,
          popped: state.popped,
          requireWinnerInfo: state.requireWinnerInfo || Array(state.prizes.length).fill(false),
          gridSize: state.gridSize || Math.sqrt(state.prizes.length) || 5
        })
      });
      console.log(`[SyncHelper] Saved board state to Supabase DB for Account ${this.accountId}`);
    } catch (err) {
      console.warn(`[SyncHelper] Failed to save board state to Supabase DB:`, err);
    }
  }

  // Host processes peer throw inside Broadcast engine
  _handleSupabaseThrow(req) {
    const localKey = `balloon_state_acc_${this.accountId}`;
    let state = JSON.parse(localStorage.getItem(localKey));
    if (!state) return;

    // Supabase duplicate throw mitigation per device
    const now = Date.now();
    if (!this.lastSupabaseDeviceThrowTime) this.lastSupabaseDeviceThrowTime = {};
    const deviceId = req.socketId || 'default';
    const lastThrow = this.lastSupabaseDeviceThrowTime[deviceId] || 0;
    if (now - lastThrow < 1800) {
      console.log(`[Supabase] Blocked duplicate throw request for device ${deviceId}.`);
      return;
    }
    this.lastSupabaseDeviceThrowTime[deviceId] = now;

    const unpoppedIndices = [];
    for (let i = 0; i < state.popped.length; i++) {
      if (!state.popped[i]) unpoppedIndices.push(i);
    }

    if (unpoppedIndices.length === 0) {
      this.channel.send({
        type: 'broadcast',
        event: 'throw-response',
        payload: { status: 'error', message: '모든 풍선이 이미 터졌습니다!', socketId: req.socketId }
      });
      return;
    }

    const isMiss = (req.intensity < 0.6) || (Math.random() < 0.15);
    
    // Find target index based on 2D tilt coordinates mapping
    const gridSize = state.gridSize || Math.sqrt(state.prizes.length) || 5;
    let targetIndex;
    if (req.tilt && (req.tilt.x !== undefined || req.tilt.y !== undefined)) {
      const col = Math.max(0, Math.min(gridSize - 1, Math.floor(((req.tilt.x + 1) / 2) * gridSize)));
      const row = Math.max(0, Math.min(gridSize - 1, Math.floor(((req.tilt.y + 1) / 2) * gridSize)));
      const tiltedIndex = row * gridSize + col;
      
      let closestIndex = unpoppedIndices[0];
      let minDistanceSq = Infinity;
      for (const idx of unpoppedIndices) {
        const r = Math.floor(idx / gridSize);
        const c = idx % gridSize;
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
      targetIndex = unpoppedIndices[Math.floor(Math.random() * unpoppedIndices.length)];
    }

    if (isMiss) {
      this.channel.send({
        type: 'broadcast',
        event: 'balloon-miss-trigger',
        payload: { index: targetIndex, intensity: req.intensity || 1 }
      });

      this.channel.send({
        type: 'broadcast',
        event: 'throw-response',
        payload: { status: 'miss', index: targetIndex, socketId: req.socketId }
      });
      return;
    }

    // Success Hit!
    state.popped[targetIndex] = true;
    localStorage.setItem(localKey, JSON.stringify(state));
    this._saveBoardStateSupabase(state);

    // Broadcast new popped state
    this.channel.send({
      type: 'broadcast',
      event: 'state-updated',
      payload: state
    });

    this.channel.send({
      type: 'broadcast',
      event: 'balloon-pop-trigger',
      payload: {
        index: targetIndex,
        prize: state.prizes[targetIndex],
        intensity: req.intensity || 1
      }
    });

    this.channel.send({
      type: 'broadcast',
      event: 'throw-response',
      payload: {
        status: 'success',
        index: targetIndex,
        prize: state.prizes[targetIndex],
        requireWinnerInfo: state.requireWinnerInfo ? state.requireWinnerInfo[targetIndex] : false,
        socketId: req.socketId
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
        popped: Array(25).fill(false),
        requireWinnerInfo: Array(25).fill(false),
        gridSize: 5
      };
      localStorage.setItem(localKey, JSON.stringify(state));
    } else if (!state.requireWinnerInfo) {
      state.requireWinnerInfo = Array(state.prizes.length).fill(false);
      localStorage.setItem(localKey, JSON.stringify(state));
    }

    if (this.onInitCallback) {
      this.onInitCallback({
        prizes: state.prizes,
        popped: state.popped,
        requireWinnerInfo: state.requireWinnerInfo,
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

      // Firebase duplicate throw mitigation per device
      const now = Date.now();
      if (!this.lastFirebaseDeviceThrowTime) this.lastFirebaseDeviceThrowTime = {};
      const deviceId = req.socketId || 'default';
      const lastThrow = this.lastFirebaseDeviceThrowTime[deviceId] || 0;
      if (now - lastThrow < 1800) {
        console.log(`[Firebase] Blocked duplicate throw request for device ${deviceId}.`);
        return;
      }
      this.lastFirebaseDeviceThrowTime[deviceId] = now;

      const unpoppedIndices = [];
      for (let i = 0; i < state.popped.length; i++) {
        if (!state.popped[i]) unpoppedIndices.push(i);
      }

      if (unpoppedIndices.length === 0) {
        this.respondToFirebaseThrow({ status: 'error', message: '모든 풍선이 이미 터졌습니다!' }, req.socketId);
        return;
      }

      const isMiss = (req.intensity < 0.6) || (Math.random() < 0.15);
      
      const gridSize = state.gridSize || Math.sqrt(state.prizes.length) || 5;
      let targetIndex;
      if (req.tilt && (req.tilt.x !== undefined || req.tilt.y !== undefined)) {
        const col = Math.max(0, Math.min(gridSize - 1, Math.floor(((req.tilt.x + 1) / 2) * gridSize)));
        const row = Math.max(0, Math.min(gridSize - 1, Math.floor(((req.tilt.y + 1) / 2) * gridSize)));
        
        let closestIndex = unpoppedIndices[0];
        let minDistanceSq = Infinity;
        for (const idx of unpoppedIndices) {
          const r = Math.floor(idx / gridSize);
          const c = idx % gridSize;
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
        targetIndex = unpoppedIndices[Math.floor(Math.random() * unpoppedIndices.length)];
      }

      if (isMiss) {
        if (this.onMissTriggerCallback) {
          this.onMissTriggerCallback({ index: targetIndex, intensity: req.intensity || 1 });
        }
        this.respondToFirebaseThrow({ status: 'miss', index: targetIndex }, req.socketId);
        return;
      }

      state.popped[targetIndex] = true;
      accountRef.child('state').set(state);

      if (this.onPopTriggerCallback) {
        this.onPopTriggerCallback({
          index: targetIndex,
          prize: state.prizes[targetIndex],
          intensity: req.intensity || 1
        });
      }

      this.respondToFirebaseThrow({
        status: 'success',
        index: targetIndex,
        prize: state.prizes[targetIndex],
        requireWinnerInfo: state.requireWinnerInfo ? state.requireWinnerInfo[targetIndex] : false
      }, req.socketId);
    });
  }

  respondToFirebaseThrow(result, socketId) {
    const throwRespRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/throw_response`);
    throwRespRef.set({
      ...result,
      socketId: socketId,
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
      state.popped = Array(state.prizes.length).fill(false);
      if (options.shuffle) {
        for (let i = state.prizes.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [state.prizes[i], state.prizes[j]] = [state.prizes[j], state.prizes[i]];
        }
      }
      localStorage.setItem(localKey, JSON.stringify(state));
      this._saveBoardStateSupabase(state);
      
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
          state.popped = Array(state.prizes.length).fill(false);
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
        this._saveBoardStateSupabase(state);
        
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
        this._saveBoardStateSupabase(state);
        
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
      this._saveBoardStateSupabase(state);
      
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

  updatePrizesAndSettings(updatedPrizes, requireWinnerInfo) {
    const size = updatedPrizes.length;
    const gridSize = Math.sqrt(size) || 5;

    if (this.mode === 'socket') {
      this.socket.emit('admin-update-prizes-and-settings', { 
        prizes: updatedPrizes, 
        requireWinnerInfo: requireWinnerInfo,
        gridSize: gridSize
      });
    } else if (this.mode === 'local-fallback' || this.mode === 'supabase') {
      const localKey = `balloon_state_acc_${this.accountId}`;
      let state = JSON.parse(localStorage.getItem(localKey)) || { prizes: [], popped: [], requireWinnerInfo: [] };
      state.prizes = updatedPrizes;
      state.requireWinnerInfo = requireWinnerInfo;
      state.gridSize = gridSize;

      // Resize popped array to match the new grid size
      if (!state.popped) state.popped = [];
      if (state.popped.length < size) {
        while (state.popped.length < size) {
          state.popped.push(false);
        }
      } else if (state.popped.length > size) {
        state.popped = state.popped.slice(0, size);
      }

      localStorage.setItem(localKey, JSON.stringify(state));
      this._saveBoardStateSupabase(state);
      
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
          state.requireWinnerInfo = requireWinnerInfo;
          state.gridSize = gridSize;

          // Resize popped array to match the new grid size
          if (!state.popped) state.popped = [];
          if (state.popped.length < size) {
            while (state.popped.length < size) {
              state.popped.push(false);
            }
          } else if (state.popped.length > size) {
            state.popped = state.popped.slice(0, size);
          }

          stateRef.set(state);
        }
      });
    }
  }

  throwDart(intensity, extraData = {}, onResult) {
    const now = Date.now();
    if (this._lastClientThrowTime && (now - this._lastClientThrowTime < 2000)) {
      console.warn("[SyncHelper] Blocked client double-throw invocation.");
      return;
    }
    this._lastClientThrowTime = now;

    if (this.mode === 'socket') {
      this.socket.emit('mobile-throw', { intensity: intensity, ...extraData });
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
      
      const gridSize = state.gridSize || Math.sqrt(state.prizes.length) || 5;
      let targetIndex;
      if (extraData.tilt && (extraData.tilt.x !== undefined || extraData.tilt.y !== undefined)) {
        const col = Math.max(0, Math.min(gridSize - 1, Math.floor(((extraData.tilt.x + 1) / 2) * gridSize)));
        const row = Math.max(0, Math.min(gridSize - 1, Math.floor(((extraData.tilt.y + 1) / 2) * gridSize)));
        
        let closestIndex = unpopped[0];
        let minDistanceSq = Infinity;
        for (const idx of unpopped) {
          const r = Math.floor(idx / gridSize);
          const c = idx % gridSize;
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
        targetIndex = unpopped[Math.floor(Math.random() * unpopped.length)];
      }

      if (isMiss) {
        onResult({ status: 'miss', index: targetIndex });
      } else {
        state.popped[targetIndex] = true;
        localStorage.setItem(localKey, JSON.stringify(state));
        if (this.onStateUpdateCallback) this.onStateUpdateCallback(state);
        onResult({ 
          status: 'success', 
          index: targetIndex, 
          prize: state.prizes[targetIndex],
          requireWinnerInfo: state.requireWinnerInfo ? state.requireWinnerInfo[targetIndex] : false
        });
      }
    } else if (this.mode === 'supabase') {
      this.onThrowResponseCallback = (data) => {
        onResult(data);
      };
      this.channel.send({
        type: 'broadcast',
        event: 'throw-request',
        payload: { intensity: intensity, socketId: this.socketId, ...extraData }
      });
    } else {
      this.onThrowResponseCallback = (data) => {
        onResult(data);
      };
      const throwReqRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/throw_request`);
      throwReqRef.set({
        intensity: intensity,
        tilt: extraData.tilt || null,
        socketId: this.socketId,
        timestamp: Date.now()
      });
    }
  }

  submitWinnerInfo(employeeId, phoneNumber, prize, onResult) {
    // Client-side duplicate check (for fast validation)
    const cleanPhone = (p) => String(p).replace(/[^0-9]/g, '');
    const alreadyExists = this._winnersStore.some(
      w => (w.employeeId && w.employeeId.trim() === employeeId.trim()) ||
           (w.phoneNumber && cleanPhone(w.phoneNumber) === cleanPhone(phoneNumber))
    );
    if (alreadyExists) {
      onResult({ status: 'error', message: '이미 등록된 사번 또는 전화번호입니다. 중복 제출이 제한됩니다.' });
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

    if (this.mode === 'socket') {
      // First try HTTP POST, then fallback to Socket.io emit
      fetch(`/api/winners/${this.accountId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ employeeId, phoneNumber, prize })
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          // Don't add to local store here - server will broadcast via socket.io 'new-winner' event
          // which will be received by all clients including the admin
          onResult({ status: 'success' });
        } else {
          onResult({ status: 'error', message: data.message });
        }
      })
      .catch(err => {
        console.warn("[SyncHelper] HTTP winner submission failed, falling back to socket:", err);
        this.socket.emit('submit-winner-info', { employeeId, phoneNumber, prize });
        this.socket.once('winner-info-result', (data) => {
          onResult(data);
        });
      });
    } else if (this.mode === 'firebase') {
      try {
        const winnersRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/winners`);
        winnersRef.push(winnerInfo).then(() => {
          onResult({ status: 'success' });
        }).catch(err => {
          onResult({ status: 'error', message: err.message });
        });
      } catch (e) {
        onResult({ status: 'error', message: e.message });
      }
    } else if (this.mode === 'supabase') {
      // Add to in-memory store immediately (so this device's getWinners() reflects it right away)
      this._winnersStore.push(winnerInfo);
      this._winnersStoreLoaded = true;

      // Persist to localStorage as a local backup
      const localKey = `winners_list_acc_${this.accountId}`;
      const list = JSON.parse(localStorage.getItem(localKey)) || [];
      list.push(winnerInfo);
      localStorage.setItem(localKey, JSON.stringify(list));

      // Also POST to server API for persistent storage (Vercel Serverless Function)
      // This ensures data survives page refresh on the admin page.
      fetch(`/api/winners/${this.accountId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, phoneNumber, prize })
      }).then(res => res.json())
        .then(data => console.log('[SyncHelper] Winner persisted via API:', data.status))
        .catch(err => console.warn('[SyncHelper] API persist failed (offline or no server), using broadcast only:', err));

      // Broadcast to all connected clients (admin/host) via Supabase Realtime for real-time notification
      if (this.channel) {
        this.channel.send({
          type: 'broadcast',
          event: 'new-winner-broadcast',
          payload: winnerInfo
        }).then(() => {
          console.log('[SyncHelper] Winner broadcast sent successfully via Supabase.');
        }).catch(err => {
          console.warn('[SyncHelper] Winner broadcast failed:', err);
        });
      } else {
        console.warn('[SyncHelper] Supabase channel not available for winner broadcast.');
      }
      onResult({ status: 'success' });
    } else {
      // Local fallback mode — save to in-memory store and localStorage
      this._winnersStore.push(winnerInfo);
      this._winnersStoreLoaded = true;
      const localKey = `winners_list_acc_${this.accountId}`;
      const list = JSON.parse(localStorage.getItem(localKey)) || [];
      list.push(winnerInfo);
      localStorage.setItem(localKey, JSON.stringify(list));
      onResult({ status: 'success' });
    }
  }

  getWinners(callback) {
    if (this.mode === 'socket') {
      fetch(`/api/winners/${this.accountId}`)
        .then(res => res.json())
        .then(data => {
          // Merge server data with in-memory store to catch any race conditions
          const serverWinners = data.winners || [];
          callback(serverWinners);
        })
        .catch(err => {
          console.warn("[SyncHelper] Failed to load winners via HTTP, using in-memory store:", err);
          callback(this._winnersStore);
        });
    } else if (this.mode === 'firebase') {
      if (this.db) {
        const winnersRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/winners`);
        winnersRef.once('value', (snapshot) => {
          const val = snapshot.val();
          if (val) {
            const list = Object.values(val);
            callback(list);
          } else {
            callback([]);
          }
        });
      } else {
        callback([]);
      }
    } else {
      // Supabase or local-fallback mode:
      // Primary: try to fetch from the server API (Vercel Serverless Function backed by Supabase DB)
      // This ensures we get data submitted by other devices (e.g. mobile -> admin).
      fetch(`/api/winners/${this.accountId}`)
        .then(res => res.json())
        .then(data => {
          const apiWinners = data.winners || [];
          // Merge API winners into in-memory store (avoid duplicates)
          apiWinners.forEach(w => {
            const exists = this._winnersStore.some(
              s => s.employeeId === w.employeeId && s.timestamp === w.timestamp
            );
            if (!exists) this._winnersStore.push(w);
          });
          this._winnersStoreLoaded = true;
          callback(this._winnersStore);
        })
        .catch(err => {
          console.warn('[SyncHelper] API getWinners failed, using in-memory/localStorage:', err);
          // Fall back to in-memory store (populated by broadcast events this session)
          if (this._winnersStoreLoaded || this._winnersStore.length > 0) {
            callback(this._winnersStore);
          } else {
            // Last resort: seed from localStorage
            const localKey = `winners_list_acc_${this.accountId}`;
            const list = JSON.parse(localStorage.getItem(localKey)) || [];
            list.forEach(w => {
              const exists = this._winnersStore.some(
                s => s.employeeId === w.employeeId && s.timestamp === w.timestamp
              );
              if (!exists) this._winnersStore.push(w);
            });
            this._winnersStoreLoaded = true;
            callback(this._winnersStore);
          }
        });
    }
  }

  updateRequireWinnerInfo(requireWinnerInfo) {
    if (this.mode === 'socket') {
      this.socket.emit('admin-update-require-winner-info', requireWinnerInfo);
    } else if (this.mode === 'local-fallback' || this.mode === 'supabase') {
      const localKey = `balloon_state_acc_${this.accountId}`;
      let state = JSON.parse(localStorage.getItem(localKey)) || { prizes: [], popped: [] };
      state.requireWinnerInfo = requireWinnerInfo;
      localStorage.setItem(localKey, JSON.stringify(state));
      this._saveBoardStateSupabase(state);
      
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
          state.requireWinnerInfo = requireWinnerInfo;
          stateRef.set(state);
        }
      });
    }
  }
  clearWinners(callback) {
    if (this.mode === 'socket' || this.mode === 'supabase' || this.mode === 'local-fallback') {
      // HTTP DELETE to server API
      fetch(`/api/winners/${this.accountId}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
          // Also clear in-memory store
          this._winnersStore = [];
          this._winnersStoreLoaded = true;
          // Clear localStorage backup
          const localKey = `winners_list_acc_${this.accountId}`;
          localStorage.removeItem(localKey);
          callback({ status: 'success' });
        })
        .catch(err => {
          console.warn('[SyncHelper] clearWinners HTTP failed:', err);
          // Still clear local stores even if server fails
          this._winnersStore = [];
          const localKey = `winners_list_acc_${this.accountId}`;
          localStorage.removeItem(localKey);
          callback({ status: 'error', message: err.message });
        });
    } else if (this.mode === 'firebase') {
      const winnersRef = this.db.ref(`/rooms/${this.room}/accounts/${this.accountId}/winners`);
      winnersRef.remove()
        .then(() => callback({ status: 'success' }))
        .catch(err => callback({ status: 'error', message: err.message }));
    } else {
      // Fallback: only clear local
      this._winnersStore = [];
      const localKey = `winners_list_acc_${this.accountId}`;
      localStorage.removeItem(localKey);
      callback({ status: 'success' });
    }
  }

  updateGridSize(size) {
    if (this.mode === 'socket') {
      this.socket.emit('admin-change-grid-size', size);
    } else if (this.mode === 'local-fallback' || this.mode === 'supabase') {
      const localKey = `balloon_state_acc_${this.accountId}`;
      let state = JSON.parse(localStorage.getItem(localKey)) || { prizes: [], popped: [] };
      state.gridSize = size;
      const targetLen = size * size;
      if (state.prizes.length < targetLen) {
        while (state.prizes.length < targetLen) {
          state.prizes.push("꽝 (아쉬워요!)");
          state.popped.push(false);
          if (!state.requireWinnerInfo) state.requireWinnerInfo = [];
          state.requireWinnerInfo.push(false);
        }
      } else if (state.prizes.length > targetLen) {
        state.prizes = state.prizes.slice(0, targetLen);
        state.popped = state.popped.slice(0, targetLen);
        if (state.requireWinnerInfo) {
          state.requireWinnerInfo = state.requireWinnerInfo.slice(0, targetLen);
        }
      }
      localStorage.setItem(localKey, JSON.stringify(state));
      this._saveBoardStateSupabase(state);
      
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
          state.gridSize = size;
          const targetLen = size * size;
          if (state.prizes.length < targetLen) {
            while (state.prizes.length < targetLen) {
              state.prizes.push("꽝 (아쉬워요!)");
              state.popped.push(false);
              if (!state.requireWinnerInfo) state.requireWinnerInfo = [];
              state.requireWinnerInfo.push(false);
            }
          } else if (state.prizes.length > targetLen) {
            state.prizes = state.prizes.slice(0, targetLen);
            state.popped = state.popped.slice(0, targetLen);
            if (state.requireWinnerInfo) {
              state.requireWinnerInfo = state.requireWinnerInfo.slice(0, targetLen);
            }
          }
          accountRef.child('state').set(state);
          accountRef.child('reset_trigger').set({ timestamp: Date.now() });
        }
      });
    }
  }

}

const SyncHelper = new BalloonSyncHelper();
