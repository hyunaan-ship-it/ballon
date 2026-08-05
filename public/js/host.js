// Real-Time Motion Balloon Popping Game - Host Script
// Connection is dynamically managed by SyncHelper below.

// Sound Synthesizer using Web Audio API
class SoundSynth {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    
    this.bgmVolume = 0.4;
    this.bgmMuted = false;
    this.sfxVolume = 0.9; // High default volume as requested
    this.sfxMuted = false;
    
    this.popBuffer = null;
    this.bgm = null;
    
    // Asynchronously load custom pop audio
    this.loadPopSound();
  }
  
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.bgm) {
      this.bgm = new Audio('/sounds/bgm.webm');
      this.bgm.loop = true;
      this.bgm.volume = this.bgmMuted ? 0 : this.bgmVolume;
    }
  }

  async loadPopSound() {
    try {
      const response = await fetch('/sounds/pop_raw.webm');
      const arrayBuffer = await response.arrayBuffer();
      // Defer AudioContext initialization until user gesture if needed,
      // but try to decode now if possible.
      const TmpCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.popBuffer = await TmpCtx.decodeAudioData(arrayBuffer);
      console.log("Pop sound loaded and decoded successfully. Duration:", this.popBuffer.duration);
    } catch (e) {
      console.error("Failed to load/decode pop sound:", e);
    }
  }

  startBgm() {
    this.init();
    if (this.bgm) {
      this.bgm.play().catch(err => {
        console.log("Autoplay blocked. BGM will play on user interaction.", err);
      });
    }
  }

  setBgmVolume(vol) {
    this.bgmVolume = parseFloat(vol);
    if (this.bgm) {
      this.bgm.volume = this.bgmMuted ? 0 : this.bgmVolume;
    }
  }

  toggleBgmMute() {
    this.bgmMuted = !this.bgmMuted;
    if (this.bgm) {
      this.bgm.volume = this.bgmMuted ? 0 : this.bgmVolume;
    }
    return this.bgmMuted;
  }

  setSfxVolume(vol) {
    this.sfxVolume = parseFloat(vol);
  }

  toggleSfxMute() {
    this.sfxMuted = !this.sfxMuted;
    return this.sfxMuted;
  }

  toggle(forceState) {
    this.enabled = forceState !== undefined ? forceState : !this.enabled;
    return this.enabled;
  }

  playPop() {
    if (!this.enabled || this.sfxMuted) return;
    this.init();
    
    // If popBuffer is decoded, play it with Web Audio API starting at 0:04
    if (this.popBuffer) {
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = this.popBuffer;
      
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(this.sfxVolume * 1.5, now); // Boost the volume for extra surprise/impact!
      
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      // The pop starts at 4.0s offset in the video. Fallback to 0 if buffer is too short.
      const offset = this.popBuffer.duration > 4.0 ? 4.0 : 0;
      
      // IMPORTANT: Stop after 1.2s so the rest of the webm (which may contain BGM audio)
      // does NOT keep playing and overlap with the looping bgm.webm track.
      const popDuration = 1.2;
      gainNode.gain.setValueAtTime(this.sfxVolume * 1.5, now);
      gainNode.gain.setValueAtTime(this.sfxVolume * 1.5, now + 0.8);
      gainNode.gain.linearRampToValueAtTime(0.0001, now + popDuration);
      
      source.start(now, offset);
      source.stop(now + popDuration);
      return;
    }

    // Fallback: Layered Synthetic Pop
    this.playSyntheticPop();
  }

  playSyntheticPop() {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const bassGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);
    
    bassGain.gain.setValueAtTime(this.sfxVolume * 2.2, now);
    bassGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    
    osc.connect(bassGain);
    bassGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  playMiss() {
    if (!this.enabled || this.sfxMuted) return;
    this.init();
    const ctx = this.ctx;
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(10, now + 0.15);
    
    gain.gain.setValueAtTime(this.sfxVolume * 1.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.16);
  }
  
  playThrow() {
    if (!this.enabled || this.sfxMuted) return;
    this.init();
    const ctx = this.ctx;
    
    const bufferSize = ctx.sampleRate * 0.35;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.5;
    filter.frequency.setValueAtTime(180, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.25);
    
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(this.sfxVolume * 0.18, ctx.currentTime + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    noise.start();
    noise.stop(ctx.currentTime + 0.35);
  }
  
  playVictory() {
    if (!this.enabled || this.sfxMuted) return;
    this.init();
    const ctx = this.ctx;
    
    const playNote = (freq, startTime, duration, type = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(this.sfxVolume * 0.12, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    
    const baseTime = ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      playNote(freq, baseTime + idx * 0.1, 0.5, 'sine');
    });
    
    const playChord = (freq, startTime) => {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc1.type = 'triangle';
      osc2.type = 'sawtooth';
      
      osc1.frequency.setValueAtTime(freq, startTime);
      osc2.frequency.setValueAtTime(freq + 2, startTime);
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, startTime);
      filter.frequency.exponentialRampToValueAtTime(400, startTime + 1.2);
      
      gain.gain.setValueAtTime(this.sfxVolume * 0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.6);
      
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + 1.6);
      osc2.stop(startTime + 1.6);
    };
    
    const chordTime = baseTime + notes.length * 0.1;
    playChord(261.63, chordTime);
    playChord(329.63, chordTime);
    playChord(392.00, chordTime);
    playChord(523.25, chordTime);
  }
}

const sounds = new SoundSynth();

// Colors mapping for balloon styles
const balloonColors = [
  'var(--balloon-red)',
  'var(--balloon-blue)',
  'var(--balloon-green)',
  'var(--balloon-yellow)',
  'var(--balloon-purple)',
  'var(--balloon-orange)',
  'var(--balloon-pink)'
];

const balloonKnotColors = [
  '#d90429', // red
  '#2e86de', // blue
  '#20bf6b', // green
  '#f1c40f', // yellow
  '#8c7ae6', // purple
  '#e67e22', // orange
  '#f368e0'  // pink
];

// Helper to match prize to emoji
function getPrizeEmoji(prizeText) {
  const text = prizeText.toLowerCase();
  if (text.includes('커피') || text.includes('스타벅스') || text.includes('starbucks') || text.includes('카페')) return '☕';
  if (text.includes('치킨') || text.includes('피자') || text.includes('bhc') || text.includes('굽네')) return '🍗';
  if (text.includes('상품권') || text.includes('문화상품권') || text.includes('신세계')) return '🎫';
  if (text.includes('에어팟') || text.includes('airpods') || text.includes('아이폰') || text.includes('가전') || text.includes('패드')) return '🎧';
  if (text.includes('아이스크림') || text.includes('베스킨') || text.includes('베라')) return '🍦';
  if (text.includes('꽝') || text.includes('아쉬워요') || text.includes('다음 기회')) return '💨';
  if (text.includes('대박') || text.includes('특상') || text.includes('1등')) return '👑';
  return '🎁';
}

// Global Game State from Server (Pre-initialized so balloons show colorful immediately)
let serverPrizes = [
  "스타벅스 커피", "문화상품권 1만원", "꽝 (아쉬워요!)", "치킨 쿠폰", "꽝 (아쉬워요!)",
  "꽝 (아쉬워요!)", "베스킨라빈스 싱글", "스타벅스 커피", "꽝 (아쉬워요!)", "문화상품권 1만원",
  "신세계 상품권 3만원", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)",
  "치킨 쿠폰", "꽝 (아쉬워요!)", "문화상품권 1만원", "꽝 (아쉬워요!)", "베스킨라빈스 싱글",
  "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "대박! 에어팟 프로"
];
let serverPopped = Array(25).fill(false);
let lastAnimatedPopIndex = null;
let lastAnimatedPopTime = 0;
let lastAnimatedMissIndex = null;
let lastAnimatedMissTime = 0;

const gridEl = document.getElementById('balloon-grid');
const mobileCountVal = document.getElementById('mobile-count-val');
const poppedRatioEl = document.getElementById('popped-ratio');
const celebrationOverlay = document.getElementById('celebration-overlay');
const modalPrizeEmoji = document.getElementById('modal-prize-emoji');
const modalPrizeText = document.getElementById('modal-prize-text');
const modalCloseBtn = document.getElementById('modal-close-btn');
const soundBtn = document.getElementById('sound-btn');
const resetBtn = document.getElementById('reset-btn');

// --- Account & Multi-Tenant Routing UI ---
const urlParams = new URLSearchParams(window.location.search);
let accountId = urlParams.get('account');
const room = getOrGenerateRoomId();

const accountOverlay = document.getElementById('account-select-overlay');

if (!accountId) {
  // Show stunning selection overlay
  accountOverlay.style.display = 'flex';
  
  // Attach select handlers to cards
  document.querySelectorAll('.account-card-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedAcc = btn.getAttribute('data-account');
      window.location.search = `?room=${room}&account=${selectedAcc}`;
    });
  });
} else {
  // Dismiss overlay
  accountOverlay.style.display = 'none';
  
  // Render default board immediately so balloons appear on screen without waiting
  renderBoard();
  
  // Highlight active pill switcher
  document.querySelectorAll('.pill-btn').forEach(pill => {
    const acc = pill.getAttribute('data-acc');
    if (acc === accountId) {
      pill.classList.add('active');
    }
    
    pill.addEventListener('click', () => {
      window.location.search = `?room=${room}&account=${acc}`;
    });
  });
  
  // Initialize Unified Sync Layer!
  SyncHelper.init({
    role: 'host',
    accountId: accountId,
    onInit: (data) => {
      serverPrizes = data.prizes;
      serverPopped = data.popped;
      renderBoard();
      
      // Dynamic Mobile URL detection to support local offline networks, corporate Wi-Fi, and public tunnels (like ngrok) simultaneously!
      let mobileUrl = data.mobileUrl;
      
      if (SYNC_CONFIG.mode === 'socket') {
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
          mobileUrl = window.location.origin + `/mobile.html?account=${accountId}`;
        }
      }
      
      // QR Code Generation
      const qrBox = document.getElementById('qrcode-box');
      qrBox.innerHTML = '';
      
      try {
        new QRCode(qrBox, {
          text: mobileUrl,
          width: 150,
          height: 150,
          colorDark: '#130d22',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
        
        document.getElementById('qr-address-desc').innerHTML = `모바일 다트 접속 URL:<br><a href="${mobileUrl}" target="_blank" style="color: var(--accent-cyan); font-weight: 700; text-decoration: none; word-break: break-all;">${mobileUrl}</a>`;
        
        const simplifiedUrl = mobileUrl.replace('http://', '').replace('https://', '');
        const manualUrlEl = document.getElementById('manual-url-text');
        if (manualUrlEl) {
          manualUrlEl.innerText = simplifiedUrl;
        }
      } catch (err) {
        console.error("QR Code Generation failed:", err);
      }
    },
    onStateUpdate: (data) => {
      serverPrizes = data.prizes;
      serverPopped = data.popped;
      
      const size = serverPrizes.length;
      const gridSize = Math.sqrt(size) || 5;
      gridEl.className = `board-grid grid-${gridSize}x${gridSize}`;
      
      renderBoard();
    },
    onReset: () => {
      serverPopped = Array(serverPrizes.length).fill(false);
      renderBoard();
      celebrationOverlay.classList.remove('active');
    },
    onPopTrigger: (data) => {
      if (lastAnimatedPopIndex === data.index && (Date.now() - lastAnimatedPopTime < 2000)) {
        console.log(`[Host] Blocked duplicate pop trigger animation for cell ${data.index}`);
        return;
      }
      lastAnimatedPopIndex = data.index;
      lastAnimatedPopTime = Date.now();

      animateDartThrow(data.index, () => {
        executePop(data.index, data.prize);
      });
    },
    onMissTrigger: (data) => {
      if (lastAnimatedMissIndex === data.index && (Date.now() - lastAnimatedMissTime < 2000)) {
        console.log(`[Host] Blocked duplicate miss trigger animation for cell ${data.index}`);
        return;
      }
      lastAnimatedMissIndex = data.index;
      lastAnimatedMissTime = Date.now();

      animateDartThrow(data.index, () => {
        executeMiss(data.index);
      }, true);
    },
    onMobileCount: (count) => {
      mobileCountVal.innerText = `${count}대 연결됨`;
    },
    onPrizeConfirmed: () => {
      celebrationOverlay.classList.remove('active');
    },
    onDisconnect: (reason) => {
      console.warn("[Host] Disconnected from server:", reason);
      if (mobileCountVal) {
        mobileCountVal.style.color = '#ff1744';
        mobileCountVal.innerText = '서버 연결 끊김 (재연결 중...)';
      }
    },
    onConnect: () => {
      console.log("[Host] Connected/Reconnected to server.");
      if (mobileCountVal) {
        mobileCountVal.style.color = '';
      }
    }
  });
}

// Modify balloon direct click listener to use SyncHelper
function renderBoard() {
  gridEl.innerHTML = '';
  const size = serverPrizes.length;
  const gridSize = Math.sqrt(size) || 5;
  gridEl.className = `board-grid grid-${gridSize}x${gridSize}`;
  
  for (let i = 0; i < size; i++) {
    const isPopped = serverPopped[i];
    const prize = serverPrizes[i] || '경품';
    const colorIndex = i % balloonColors.length;
    
    const cell = document.createElement('div');
    cell.className = `grid-cell ${isPopped ? 'popped' : ''}`;
    cell.id = `cell-${i}`;
    
    const prizeCard = document.createElement('div');
    prizeCard.className = 'prize-card';
    
    const prizeTag = document.createElement('div');
    prizeTag.className = 'prize-index-tag';
    prizeTag.innerText = i + 1;
    
    const parsed = parsePrize(prize);
    
    const prizeIcon = document.createElement('div');
    prizeIcon.className = 'prize-icon';
    
    const prizeImg = document.createElement('img');
    prizeImg.className = 'prize-img-element';
    prizeImg.style.display = 'none';
    
    if (parsed.image) {
      prizeImg.src = parsed.image;
      prizeImg.style.display = 'block';
      prizeIcon.style.display = 'none';
    } else {
      prizeIcon.innerText = getPrizeEmoji(parsed.text);
      prizeIcon.style.display = 'block';
    }
    
    const prizeName = document.createElement('div');
    prizeName.className = 'prize-name';
    prizeName.innerText = parsed.text;
    
    prizeCard.appendChild(prizeTag);
    prizeCard.appendChild(prizeIcon);
    prizeCard.appendChild(prizeImg);
    prizeCard.appendChild(prizeName);
    
    const balloonWrapper = document.createElement('div');
    balloonWrapper.className = 'balloon-wrapper';
    
    const balloon = document.createElement('div');
    balloon.className = 'balloon';
    balloon.style.background = balloonColors[colorIndex];
    balloon.style.animationDelay = `${(i * 0.15).toFixed(2)}s`;
    balloon.style.animationDuration = `${(3.5 + (i % 3) * 0.4).toFixed(2)}s`;
    
    const knot = document.createElement('div');
    knot.className = 'balloon-knot';
    knot.style.borderBottomColor = balloonKnotColors[colorIndex];
    
    const string = document.createElement('div');
    string.className = 'balloon-string';
    
    balloon.appendChild(knot);
    balloon.appendChild(string);
    balloonWrapper.appendChild(balloon);
    
    cell.appendChild(prizeCard);
    cell.appendChild(balloonWrapper);
    
    balloon.addEventListener('click', (e) => {
      e.stopPropagation();
      sounds.init();
      SyncHelper.hostDirectPop(i);
    });
    
    gridEl.appendChild(cell);
  }
  
  const unpoppedCount = serverPopped.filter(p => !p).length;
  poppedRatioEl.innerText = `남은 풍선: ${unpoppedCount} / ${serverPrizes.length}`;
}

// Particle Engine
function spawnPopParticles(cellId, colorIndex) {
  const cellEl = document.getElementById(`cell-${cellId}`);
  if (!cellEl) return;
  const container = cellEl.querySelector('.balloon-wrapper');
  if (!container) return;
  
  const rect = container.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const color = balloonKnotColors[colorIndex % balloonKnotColors.length];
  
  for (let i = 0; i < 32; i++) {
    const particle = document.createElement('div');
    particle.className = 'pop-particle';
    particle.style.background = color;
    
    const size = Math.random() * 10 + 5;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${centerX}px`;
    particle.style.top = `${centerY}px`;
    
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 140 + 40;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    
    particle.style.setProperty('--dx', `${dx}px`);
    particle.style.setProperty('--dy', `${dy}px`);
    
    particle.style.transform = `rotate(${Math.random() * 360}deg)`;
    if (Math.random() > 0.5) {
      particle.style.borderRadius = '2px';
    }
    
    container.appendChild(particle);
    
    setTimeout(() => {
      particle.remove();
    }, 600);
  }
}

// Flying Dart Animation Engine
function animateDartThrow(targetIndex, onComplete, isMiss = false) {
  sounds.playThrow();
  
  const cellEl = document.getElementById(`cell-${targetIndex}`);
  if (!cellEl) {
    onComplete();
    return;
  }
  
  const targetRect = cellEl.getBoundingClientRect();
  const offsetX = isMiss ? (Math.random() > 0.5 ? 40 : -40) : 0;
  const offsetY = isMiss ? (Math.random() > 0.5 ? 40 : -40) : 0;
  const targetX = targetRect.left + targetRect.width / 2 + offsetX;
  const targetY = targetRect.top + targetRect.height / 2 + offsetY;
  
  const dart = document.createElement('div');
  dart.className = 'flying-dart';
  
  const startX = 0;
  const startY = window.innerHeight;
  
  dart.style.left = `${startX}px`;
  dart.style.top = `${startY}px`;
  dart.style.transform = `translate(-50%, -50%) rotate(-45deg) scale(0.5)`;
  
  document.body.appendChild(dart);
  void dart.offsetWidth;
  
  dart.style.transition = 'left 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.6s cubic-bezier(0.21, 0.61, 0.35, 1), transform 0.6s linear';
  dart.style.left = `${targetX}px`;
  dart.style.top = `${targetY}px`;
  
  const angleRad = Math.atan2(targetY - startY, targetX - startX);
  const angleDeg = angleRad * (180 / Math.PI);
  dart.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg) scale(1)`;
  
  setTimeout(() => {
    if (isMiss) {
      dart.style.transition = 'transform 0.4s ease-in, top 0.4s ease-in, opacity 0.4s ease-out';
      dart.style.transform = `translate(-50%, -50%) rotate(${angleDeg + 90}deg) scale(0.8)`;
      dart.style.top = `${targetY + 120}px`;
      dart.style.opacity = '0';
      
      sounds.playMiss();
      
      const boardGrid = document.getElementById('balloon-grid');
      if (boardGrid) {
        boardGrid.style.transform = 'translate(4px, 4px)';
        setTimeout(() => { boardGrid.style.transform = ''; }, 100);
      }
      
      setTimeout(() => {
        dart.remove();
        onComplete();
      }, 400);
    } else {
      cellEl.style.transform = 'scale(0.95) rotate(4deg)';
      
      const balloonEl = cellEl.querySelector('.balloon');
      if (balloonEl) {
        balloonEl.classList.add('popping');
      }
      
      sounds.playPop();
      spawnPopParticles(targetIndex, targetIndex);
      dart.remove();
      
      setTimeout(() => {
        cellEl.style.transform = '';
        onComplete();
      }, 150);
    }
  }, 600);
}

// Pop Execution & Modal Trigger
function executePop(index, prize) {
  serverPopped[index] = true;
  const cell = document.getElementById(`cell-${index}`);
  if (cell) {
    cell.classList.add('popped');
  }
  
  const unpoppedCount = serverPopped.filter(p => !p).length;
  poppedRatioEl.innerText = `남은 풍선: ${unpoppedCount} / ${serverPrizes.length}`;
  
  const parsed = parsePrize(prize);
  
  setTimeout(() => {
    const modalCongrats = celebrationOverlay.querySelector('.modal-congrats');
    const modalTitle = celebrationOverlay.querySelector('.modal-title');
    const prizeModal = celebrationOverlay.querySelector('.prize-modal');
    
    if (prizeModal) {
      prizeModal.classList.remove('miss-mode');
    }
    if (modalCongrats) modalCongrats.innerText = "🎉 CONGRATULATIONS 🎉";
    if (modalTitle) modalTitle.innerText = "경품 당첨!";
    
    modalPrizeText.innerText = parsed.text;
    
    // Custom Image display inside the circle
    let modalPrizeImg = document.getElementById('modal-prize-image');
    if (!modalPrizeImg) {
      modalPrizeImg = document.createElement('img');
      modalPrizeImg.id = 'modal-prize-image';
      modalPrizeImg.className = 'modal-prize-image-element';
    }
    
    if (parsed.image) {
      modalPrizeImg.src = parsed.image;
      modalPrizeImg.style.display = 'block';
      modalPrizeEmoji.innerHTML = '';
      modalPrizeEmoji.appendChild(modalPrizeImg);
      modalPrizeEmoji.style.fontSize = '0'; // Hide fallback emoji font spacing
    } else {
      modalPrizeImg.style.display = 'none';
      modalPrizeEmoji.innerHTML = getPrizeEmoji(parsed.text);
      modalPrizeEmoji.style.fontSize = ''; // Restore default emoji font size
    }
    
    celebrationOverlay.classList.add('active');
  }, 450);
}

function executeMiss(index) {
  const modalCongrats = celebrationOverlay.querySelector('.modal-congrats');
  const modalTitle = celebrationOverlay.querySelector('.modal-title');
  const prizeModal = celebrationOverlay.querySelector('.prize-modal');
  
  if (prizeModal) {
    prizeModal.classList.add('miss-mode');
  }
  if (modalCongrats) modalCongrats.innerText = "💥 아쉬워요! 💥";
  if (modalTitle) modalTitle.innerText = "조준 실패!";
  
  if (modalPrizeText) modalPrizeText.innerText = "풍선을 비껴갔습니다! 다시 조준해서 던져보세요.";
  
  let modalPrizeImg = document.getElementById('modal-prize-image');
  if (modalPrizeImg) {
    modalPrizeImg.style.display = 'none';
  }
  modalPrizeEmoji.innerHTML = '😢';
  modalPrizeEmoji.style.fontSize = ''; // Restore default size
  
  celebrationOverlay.classList.add('active');
}

// UI Event Listeners
modalCloseBtn.addEventListener('click', () => {
  SyncHelper.confirmPrizeClaim();
});

celebrationOverlay.addEventListener('click', (e) => {
  if (e.target === celebrationOverlay) {
    celebrationOverlay.classList.remove('active');
  }
});

// BGM UI listeners
const bgmMuteBtn = document.getElementById('bgm-mute-btn');
const bgmVolumeSlider = document.getElementById('bgm-volume-slider');
const bgmVolumeText = document.getElementById('bgm-volume-text');

if (bgmVolumeSlider) {
  bgmVolumeSlider.addEventListener('input', (e) => {
    sounds.init();
    const vol = e.target.value;
    sounds.setBgmVolume(vol);
    if (bgmVolumeText) {
      bgmVolumeText.innerText = `${Math.round(vol * 100)}%`;
    }
    sounds.startBgm();
  });
}

if (bgmMuteBtn) {
  bgmMuteBtn.addEventListener('click', () => {
    sounds.init();
    const isMuted = sounds.toggleBgmMute();
    bgmMuteBtn.innerText = isMuted ? '🔇 뮤트됨' : '🔊 켜짐';
    bgmMuteBtn.style.color = isMuted ? 'var(--text-muted)' : 'var(--accent-cyan)';
    sounds.startBgm();
  });
}

// SFX UI listeners
const sfxMuteBtn = document.getElementById('sfx-mute-btn');
const sfxVolumeSlider = document.getElementById('sfx-volume-slider');
const sfxVolumeText = document.getElementById('sfx-volume-text');

if (sfxVolumeSlider) {
  sfxVolumeSlider.addEventListener('input', (e) => {
    sounds.init();
    const vol = e.target.value;
    sounds.setSfxVolume(vol);
    if (sfxVolumeText) {
      sfxVolumeText.innerText = `${Math.round(vol * 100)}%`;
    }
  });
}

if (sfxMuteBtn) {
  sfxMuteBtn.addEventListener('click', () => {
    sounds.init();
    const isMuted = sounds.toggleSfxMute();
    sfxMuteBtn.innerText = isMuted ? '🔇 뮤트됨' : '🔊 켜짐';
    sfxMuteBtn.style.color = isMuted ? 'var(--text-muted)' : 'var(--accent-cyan)';
  });
}

resetBtn.addEventListener('click', () => {
  sounds.init();
  if (confirm("정말 모든 풍선판을 초기화하시겠습니까? (숨겨진 경품 내역은 유지됩니다)")) {
    SyncHelper.resetBoard({ shuffle: false });
  }
});

document.body.addEventListener('click', () => {
  sounds.init();
  sounds.startBgm();
}, { once: true });

// --- Integrated Prize Editor Overlay Event Listeners ---
const editPrizesBtn = document.getElementById('edit-prizes-btn');
const editPrizesOverlay = document.getElementById('edit-prizes-overlay');
const editCloseBtn = document.getElementById('edit-close-btn');
const editSaveBtn = document.getElementById('edit-save-btn');
const editPresetBtn = document.getElementById('edit-preset-btn');
const modalInputsGrid = document.getElementById('modal-inputs-grid');

function buildEditorInputs() {
  modalInputsGrid.innerHTML = '';
  const size = serverPrizes.length;
  const gridSize = Math.sqrt(size) || 5;
  modalInputsGrid.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
  
  for (let i = 0; i < size; i++) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '4px';
    wrapper.style.background = 'rgba(255, 255, 255, 0.02)';
    wrapper.style.border = '1px solid var(--glass-border)';
    wrapper.style.borderRadius = '8px';
    wrapper.style.padding = '8px';
    wrapper.id = `modal-cell-wrapper-${i}`;
    
    const parsed = parsePrize(serverPrizes[i]);
    
    const label = document.createElement('span');
    label.innerText = `${i + 1}번 풍선`;
    label.style.fontSize = '0.7rem';
    label.style.fontWeight = '700';
    label.style.color = 'var(--text-muted)';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `modal-prize-input-${i}`;
    input.value = parsed.text || '';
    input.style.width = '100%';
    input.style.background = 'rgba(0,0,0,0.3)';
    input.style.border = '1px solid var(--glass-border)';
    input.style.borderRadius = '4px';
    input.style.color = 'white';
    input.style.padding = '5px 8px';
    input.style.fontSize = '0.8rem';
    input.style.outline = 'none';
    
    input.onfocus = () => { input.style.borderColor = 'var(--accent-cyan)'; };
    input.onblur = () => { input.style.borderColor = 'var(--glass-border)'; };
    
    // Copy-Paste Image Container
    const imgContainer = document.createElement('div');
    imgContainer.className = 'prize-image-container';
    
    const pasteZone = document.createElement('div');
    pasteZone.className = 'prize-image-paste-zone';
    pasteZone.tabIndex = 0;
    pasteZone.innerText = '📋 이미지 Ctrl+V';
    
    const previewDiv = document.createElement('div');
    previewDiv.className = 'prize-image-preview';
    previewDiv.style.display = 'none';
    
    const previewImg = document.createElement('img');
    previewImg.id = `modal-prize-preview-img-${i}`;
    
    const removeImgBtn = document.createElement('button');
    removeImgBtn.className = 'remove-image-btn';
    removeImgBtn.type = 'button';
    removeImgBtn.innerText = '×';
    removeImgBtn.title = '이미지 삭제';
    
    previewDiv.appendChild(previewImg);
    previewDiv.appendChild(removeImgBtn);
    
    imgContainer.appendChild(pasteZone);
    imgContainer.appendChild(previewDiv);
    
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    wrapper.appendChild(imgContainer);
    
    if (parsed.image) {
      wrapper.dataset.image = parsed.image;
      previewImg.src = parsed.image;
      previewDiv.style.display = 'flex';
      pasteZone.style.display = 'none';
    }
    
    // Paste Event Handlers with safety and canvas compression
    function handleImagePaste(e) {
      const clipboardData = e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData);
      if (!clipboardData) return;
      const items = clipboardData.items;
      for (const item of items) {
        if (item.type.indexOf('image') === 0) {
          const blob = item.getAsFile();
          const reader = new FileReader();
          reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const MAX_WIDTH = 300;
              const MAX_HEIGHT = 300;
              let width = img.width;
              let height = img.height;
              
              if (width > height) {
                if (width > MAX_WIDTH) {
                  height = Math.round((height * MAX_WIDTH) / width);
                  width = MAX_WIDTH;
                }
              } else {
                if (height > MAX_HEIGHT) {
                  width = Math.round((width * MAX_HEIGHT) / height);
                  height = MAX_HEIGHT;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);
              
              const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
              wrapper.dataset.image = compressedBase64;
              previewImg.src = compressedBase64;
              previewDiv.style.display = 'flex';
              pasteZone.style.display = 'none';
            };
            img.src = event.target.result;
          };
          reader.readAsDataURL(blob);
          e.preventDefault();
          return;
        }
      }
    }
    
    input.addEventListener('paste', handleImagePaste);
    pasteZone.addEventListener('paste', handleImagePaste);
    pasteZone.addEventListener('click', () => { pasteZone.focus(); });
    
    removeImgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrapper.removeAttribute('data-image');
      previewImg.src = '';
      previewDiv.style.display = 'none';
      pasteZone.style.display = 'flex';
    });
    
    modalInputsGrid.appendChild(wrapper);
  }
}

editPrizesBtn.addEventListener('click', () => {
  sounds.init();
  buildEditorInputs();
  editPrizesOverlay.classList.add('active');
});

editCloseBtn.addEventListener('click', () => {
  editPrizesOverlay.classList.remove('active');
});

editPrizesOverlay.addEventListener('click', (e) => {
  if (e.target === editPrizesOverlay) {
    editPrizesOverlay.classList.remove('active');
  }
});

editPresetBtn.addEventListener('click', () => {
  const size = serverPrizes.length;
  const balancedPreset = [];
  const basePrizes = [
    "스타벅스 커피", "문화상품권 1만원", "치킨 쿠폰", "베스킨라빈스 싱글", "신세계 상품권 3만원", "대박! 에어팟 프로"
  ];
  for (let i = 0; i < size; i++) {
    if (i % 6 === 0) {
      balancedPreset.push(basePrizes[0]);
    } else if (i % 8 === 1) {
      balancedPreset.push(basePrizes[1]);
    } else if (i % 12 === 2) {
      balancedPreset.push(basePrizes[2]);
    } else if (i % 9 === 3) {
      balancedPreset.push(basePrizes[3]);
    } else if (i % 18 === 4) {
      balancedPreset.push(basePrizes[4]);
    } else if (i === size - 1) {
      balancedPreset.push(basePrizes[5]);
    } else {
      balancedPreset.push("꽝 (아쉬워요!)");
    }
  }
  for (let i = 0; i < size; i++) {
    const input = document.getElementById(`modal-prize-input-${i}`);
    const wrapper = document.getElementById(`modal-cell-wrapper-${i}`);
    if (input) {
      input.value = balancedPreset[i];
    }
    if (wrapper) {
      wrapper.removeAttribute('data-image');
      const previewImg = document.getElementById(`modal-prize-preview-img-${i}`);
      const previewDiv = wrapper.querySelector('.prize-image-preview');
      const pasteZone = wrapper.querySelector('.prize-image-paste-zone');
      if (previewImg) previewImg.src = '';
      if (previewDiv) previewDiv.style.display = 'none';
      if (pasteZone) pasteZone.style.display = 'flex';
    }
  }
});

editSaveBtn.addEventListener('click', () => {
  const updatedPrizes = [];
  const size = serverPrizes.length;
  for (let i = 0; i < size; i++) {
    const input = document.getElementById(`modal-prize-input-${i}`);
    const wrapper = document.getElementById(`modal-cell-wrapper-${i}`);
    const textVal = input ? input.value.trim() || '꽝' : '꽝';
    const imgVal = wrapper ? wrapper.dataset.image || '' : '';
    
    let prizeVal = textVal;
    if (imgVal) {
      prizeVal = JSON.stringify({ text: textVal, image: imgVal });
    }
    updatedPrizes.push(prizeVal);
  }
  SyncHelper.updatePrizes(updatedPrizes);
  editPrizesOverlay.classList.remove('active');
  alert("🎉 경품 수정사항이 성공적으로 저장 및 실시간 live 동기화되었습니다!");
});

// Handle Sync fallback notification for a stellar user guidance!
window.addEventListener('sync-fallback-active', (e) => {
  // If the user has globally disabled warning banners or previously dismissed this warning, do not display it.
  if (typeof SYNC_CONFIG !== 'undefined' && SYNC_CONFIG.suppressWarningBanner) {
    return;
  }
  if (localStorage.getItem('hide_sync_warning') === 'true') {
    return;
  }

  const alertBanner = document.createElement('div');
  alertBanner.className = 'glass-panel';
  alertBanner.style.position = 'fixed';
  alertBanner.style.bottom = '24px';
  alertBanner.style.right = '24px';
  alertBanner.style.width = '380px';
  alertBanner.style.padding = '18px 22px';
  alertBanner.style.borderRadius = '16px';
  alertBanner.style.border = '1px solid rgba(255, 193, 7, 0.3)';
  alertBanner.style.background = 'rgba(25, 15, 5, 0.9)';
  alertBanner.style.color = '#fff';
  alertBanner.style.zIndex = '99999';
  alertBanner.style.fontSize = '0.85rem';
  alertBanner.style.lineHeight = '1.5';
  alertBanner.style.boxShadow = '0 20px 40px rgba(0,0,0,0.6)';
  
  const isSupabase = e.detail.targetMode === 'supabase';
  const title = isSupabase ? '⚠️ Supabase 연동 실패 (오프라인 모드 실행)' : '⚠️ Firebase 연동 실패 (오프라인 모드 실행)';
  const targetUrl = isSupabase ? e.detail.supabaseURL : e.detail.databaseURL;
  
  const explanation = isSupabase ? `
    설정된 Supabase 실시간 브로드캐스트 채널(<code>${targetUrl}</code>) 연결이 방화벽에 차단되었거나 API 키가 유효하지 않아 <strong>로컬 오프라인 모드</strong>로 전환되었습니다.<br><br>
    이 화면에서 풍선 터트리기 시뮬레이션은 정상 플레이 가능하지만, 모바일 연동 기능을 사용하려면 <strong>public/js/firebase-config.js</strong>에 본인의 실제 Supabase <code>url</code>과 <code>anonKey</code>를 적용해 주세요.
  ` : `
    설정된 Firebase 실시간 데이터베이스(<code>${targetUrl}</code>) 연결이 방화벽에 차단되었거나 유효하지 않아 <strong>로컬 오프라인 모드</strong>로 전환되었습니다.<br><br>
    이 화면에서 풍선 터트리기 시뮬레이션은 정상 플레이 가능하지만, 모바일 연동 기능을 사용하려면 <strong>public/js/firebase-config.js</strong>에 본인의 실제 Firebase <code>databaseURL</code>을 적용해 주세요.
  `;

  alertBanner.innerHTML = `
    <div style="font-weight: 800; font-size: 0.98rem; color: #ffc107; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
      ${title}
    </div>
    <div>
      ${explanation}
    </div>
    <button onclick="localStorage.setItem('hide_sync_warning', 'true'); this.parentElement.remove()" style="position: absolute; top: 12px; right: 12px; background: none; border: none; color: #aaa; cursor: pointer; font-weight: bold; font-size: 1.1rem; transition: color 0.2s;">×</button>
  `;
  
  // Style absolute hover close
  const closeBtn = alertBanner.querySelector('button');
  closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
  closeBtn.onmouseout = () => closeBtn.style.color = '#aaa';
  
  document.body.appendChild(alertBanner);
});
