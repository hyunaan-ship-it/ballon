// Real-Time Motion Balloon Popping Game - Host Script
const socket = io();

// Sound Synthesizer using Web Audio API
class SoundSynth {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle(forceState) {
    this.enabled = forceState !== undefined ? forceState : !this.enabled;
    return this.enabled;
  }

  playPop() {
    if (!this.enabled) return;
    this.init();
    const ctx = this.ctx;
    
    // Quick down-sweeping triangle wave for the balloon deflate rubber sound
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(350, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(15, ctx.currentTime + 0.12);
    
    gain.gain.setValueAtTime(0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    
    // Pop snap noise
    const bufferSize = ctx.sampleRate * 0.04;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);
    
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    
    noise.start();
    noise.stop(ctx.currentTime + 0.04);
  }
  
  playThrow() {
    if (!this.enabled) return;
    this.init();
    const ctx = this.ctx;
    
    // Whoosh sound using sweeps on a white noise buffer
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
    gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    noise.start();
    noise.stop(ctx.currentTime + 0.35);
  }
  
  playVictory() {
    if (!this.enabled) return;
    this.init();
    const ctx = this.ctx;
    
    const playNote = (freq, startTime, duration, type = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.12, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    
    const baseTime = ctx.currentTime;
    // C major chord rollup arpeggio
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      playNote(freq, baseTime + idx * 0.1, 0.5, 'sine');
    });
    
    // Rich final synth chord
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
      
      gain.gain.setValueAtTime(0.15, startTime);
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

const gridEl = document.getElementById('balloon-grid');
const mobileCountVal = document.getElementById('mobile-count-val');
const poppedRatioEl = document.getElementById('popped-ratio');
const celebrationOverlay = document.getElementById('celebration-overlay');
const modalPrizeEmoji = document.getElementById('modal-prize-emoji');
const modalPrizeText = document.getElementById('modal-prize-text');
const modalCloseBtn = document.getElementById('modal-close-btn');
const soundBtn = document.getElementById('sound-btn');
const resetBtn = document.getElementById('reset-btn');

// Initialize the 5x5 layout
function renderBoard() {
  gridEl.innerHTML = '';
  
  for (let i = 0; i < 25; i++) {
    const isPopped = serverPopped[i];
    const prize = serverPrizes[i] || '경품';
    const colorIndex = i % balloonColors.length;
    
    // Outer Grid Cell
    const cell = document.createElement('div');
    cell.className = `grid-cell ${isPopped ? 'popped' : ''}`;
    cell.id = `cell-${i}`;
    
    // Background Prize Layer
    const prizeCard = document.createElement('div');
    prizeCard.className = 'prize-card';
    
    const prizeTag = document.createElement('div');
    prizeTag.className = 'prize-index-tag';
    prizeTag.innerText = i + 1;
    
    const prizeIcon = document.createElement('div');
    prizeIcon.className = 'prize-icon';
    prizeIcon.innerText = getPrizeEmoji(prize);
    
    const prizeName = document.createElement('div');
    prizeName.className = 'prize-name';
    prizeName.innerText = prize;
    
    prizeCard.appendChild(prizeTag);
    prizeCard.appendChild(prizeIcon);
    prizeCard.appendChild(prizeName);
    
    // Foreground Balloon Layer
    const balloonWrapper = document.createElement('div');
    balloonWrapper.className = 'balloon-wrapper';
    
    const balloon = document.createElement('div');
    balloon.className = 'balloon';
    balloon.style.background = balloonColors[colorIndex];
    // Slightly randomize float animations so they drift naturally
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
    
    // Assemble Cell
    cell.appendChild(prizeCard);
    cell.appendChild(balloonWrapper);
    
    // Click balloon direct pop action
    balloon.addEventListener('click', (e) => {
      e.stopPropagation();
      sounds.init();
      socket.emit('host-direct-pop', i);
    });
    
    gridEl.appendChild(cell);
  }
  
  // Update UI ratio
  const unpoppedCount = serverPopped.filter(p => !p).length;
  poppedRatioEl.innerText = `남은 풍선: ${unpoppedCount} / 25`;
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
  
  // Spawn 32 individual fragments
  for (let i = 0; i < 32; i++) {
    const particle = document.createElement('div');
    particle.className = 'pop-particle';
    particle.style.background = color;
    
    // Shard size variation
    const size = Math.random() * 10 + 5;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${centerX}px`;
    particle.style.top = `${centerY}px`;
    
    // Send shards in 360-degree vectors
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 140 + 40;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    
    particle.style.setProperty('--dx', `${dx}px`);
    particle.style.setProperty('--dy', `${dy}px`);
    
    // Custom random rotate and border radius for organic shape
    particle.style.transform = `rotate(${Math.random() * 360}deg)`;
    if (Math.random() > 0.5) {
      particle.style.borderRadius = '2px'; // rigid balloon shards
    }
    
    container.appendChild(particle);
    
    setTimeout(() => {
      particle.remove();
    }, 600);
  }
}

// Flying Dart Animation Engine
function animateDartThrow(targetIndex, onComplete) {
  sounds.playThrow();
  
  const cellEl = document.getElementById(`cell-${targetIndex}`);
  if (!cellEl) {
    onComplete();
    return;
  }
  
  const targetRect = cellEl.getBoundingClientRect();
  const targetX = targetRect.left + targetRect.width / 2;
  const targetY = targetRect.top + targetRect.height / 2;
  
  // Create flying dart element
  const dart = document.createElement('div');
  dart.className = 'flying-dart';
  
  // Spawn dart from bottom-left corner of the screen
  const startX = 0;
  const startY = window.innerHeight;
  
  dart.style.left = `${startX}px`;
  dart.style.top = `${startY}px`;
  dart.style.transform = `translate(-50%, -50%) rotate(-45deg) scale(0.5)`;
  
  document.body.appendChild(dart);
  
  // Trigger DOM paint
  void dart.offsetWidth;
  
  // Flight dynamics - curve throw
  const midX = (startX + targetX) / 2;
  const midY = (startY + targetY) / 2 - 150; // Arc peak
  
  // Custom transition animation for beautiful trajectory
  dart.style.transition = 'left 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94), top 0.6s cubic-bezier(0.21, 0.61, 0.35, 1), transform 0.6s linear';
  
  // Direct fly to target
  dart.style.left = `${targetX}px`;
  dart.style.top = `${targetY}px`;
  
  // Rotates dynamically during flight to point at target
  const angleRad = Math.atan2(targetY - startY, targetX - startX);
  const angleDeg = angleRad * (180 / Math.PI);
  dart.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg) scale(1)`;
  
  setTimeout(() => {
    // Hit impact - trigger shake on target cell
    cellEl.style.transform = 'scale(0.9) rotate(5deg)';
    sounds.playPop();
    
    // Explosion particles
    spawnPopParticles(targetIndex, targetIndex);
    
    // Remove dart
    dart.remove();
    
    setTimeout(() => {
      cellEl.style.transform = '';
      onComplete();
    }, 150);
  }, 600);
}

// Pop Execution & Modal Trigger
function executePop(index, prize) {
  // Flag as popped locally to trigger CSS state
  serverPopped[index] = true;
  
  // Render popped status inside the cell
  const cell = document.getElementById(`cell-${index}`);
  if (cell) {
    cell.classList.add('popped');
  }
  
  // Update count
  const unpoppedCount = serverPopped.filter(p => !p).length;
  poppedRatioEl.innerText = `남은 풍선: ${unpoppedCount} / 25`;
  
  // Show large celebratory modal
  setTimeout(() => {
    modalPrizeEmoji.innerText = getPrizeEmoji(prize);
    modalPrizeText.innerText = prize;
    celebrationOverlay.classList.add('active');
    sounds.playVictory();
  }, 450);
}

// Initial run to render colorful balloons immediately on load
renderBoard();

// Socket Event Receivers
socket.on('connect', () => {
  console.log("Connected to local socket server");
  socket.emit('join-host');
});

socket.on('init-state', (data) => {
  serverPrizes = data.prizes;
  serverPopped = data.popped;
  renderBoard();
  
  // Generate QR Code dynamically based on CURRENT browser's domain!
  // This supports localhost, local network IPs, and cellular-accessible public tunnels (like ngrok) automatically!
  const qrBox = document.getElementById('qrcode-box');
  qrBox.innerHTML = '';
  const qrCanvas = document.createElement('canvas');
  qrBox.appendChild(qrCanvas);
  
  const currentOrigin = window.location.origin;
  let mobileUrl = currentOrigin + '/mobile.html';
  
  // If Host is opened on localhost, fall back to the server's detected local IP URL 
  // so mobile devices on the same Wi-Fi can connect.
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    if (data.mobileUrl) {
      mobileUrl = data.mobileUrl;
    }
  }
  
  QRCode.toCanvas(qrCanvas, mobileUrl, {
    width: 150,
    margin: 1,
    color: {
      dark: '#130d22',
      light: '#ffffff'
    }
  }, (err) => {
    if (err) console.error("QR Code Generation failed:", err);
    else {
      document.getElementById('qr-address-desc').innerHTML = `모바일 다트 접속 URL:<br><a href="${mobileUrl}" target="_blank" style="color: var(--accent-cyan); font-weight: 700; text-decoration: none; word-break: break-all;">${mobileUrl}</a>`;
      
      // Update the simple typable address for manual connection
      const simplifiedUrl = mobileUrl.replace('http://', '').replace('/mobile.html', '');
      const manualUrlEl = document.getElementById('manual-url-text');
      if (manualUrlEl) {
        manualUrlEl.innerText = simplifiedUrl;
      }
    }
  });
});

socket.on('mobile-connected', (data) => {
  mobileCountVal.innerText = `${data.count}대 연결됨`;
});

socket.on('mobile-disconnected', (data) => {
  mobileCountVal.innerText = `${data.count}대 연결됨`;
});

socket.on('state-updated', (data) => {
  serverPrizes = data.prizes;
  serverPopped = data.popped;
  
  // If the popped state changed, apply it
  for (let i = 0; i < 25; i++) {
    const cell = document.getElementById(`cell-${i}`);
    if (cell) {
      if (serverPopped[i] && !cell.classList.contains('popped')) {
        cell.classList.add('popped');
      } else if (!serverPopped[i] && cell.classList.contains('popped')) {
        cell.classList.remove('popped');
      }
      
      // Update names behind just in case admin changed it live
      const nameEl = cell.querySelector('.prize-name');
      const iconEl = cell.querySelector('.prize-icon');
      if (nameEl && iconEl) {
        nameEl.innerText = serverPrizes[i];
        iconEl.innerText = getPrizeEmoji(serverPrizes[i]);
      }
    }
  }
  
  const unpoppedCount = serverPopped.filter(p => !p).length;
  poppedRatioEl.innerText = `남은 풍선: ${unpoppedCount} / 25`;
});

socket.on('board-reset', () => {
  serverPopped = Array(25).fill(false);
  renderBoard();
  celebrationOverlay.classList.remove('active');
});

socket.on('balloon-pop-trigger', (data) => {
  // Trigger flying dart animation first, then execute pop
  animateDartThrow(data.index, () => {
    executePop(data.index, data.prize);
  });
});

// UI Event Listners
modalCloseBtn.addEventListener('click', () => {
  celebrationOverlay.classList.remove('active');
});

celebrationOverlay.addEventListener('click', (e) => {
  if (e.target === celebrationOverlay) {
    celebrationOverlay.classList.remove('active');
  }
});

// Sound Toggle control
soundBtn.addEventListener('click', () => {
  sounds.init();
  const enabled = sounds.toggle();
  soundBtn.innerText = enabled ? '🔊 사운드: 켜짐' : '🔇 사운드: 꺼짐';
  soundBtn.className = enabled ? 'btn-secondary' : 'btn-secondary muted';
  
  if (enabled) {
    // play a soft initialization sound
    sounds.playPop();
  }
});

// Host direct Reset trigger
resetBtn.addEventListener('click', () => {
  sounds.init();
  if (confirm("정말 모든 풍선판을 초기화하시겠습니까? (숨겨진 경품 내역은 유지됩니다)")) {
    socket.emit('admin-reset-board', { shuffle: false });
  }
});

// Resume AudioContext on body interaction
document.body.addEventListener('click', () => {
  sounds.init();
}, { once: true });

// --- Integrated Prize Editor Overlay Event Listeners ---
const editPrizesBtn = document.getElementById('edit-prizes-btn');
const editPrizesOverlay = document.getElementById('edit-prizes-overlay');
const editCloseBtn = document.getElementById('edit-close-btn');
const editSaveBtn = document.getElementById('edit-save-btn');
const editPresetBtn = document.getElementById('edit-preset-btn');
const modalInputsGrid = document.getElementById('modal-inputs-grid');

// Build the editor inputs
function buildEditorInputs() {
  modalInputsGrid.innerHTML = '';
  for (let i = 0; i < 25; i++) {
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '4px';
    wrapper.style.background = 'rgba(255, 255, 255, 0.02)';
    wrapper.style.border = '1px solid var(--glass-border)';
    wrapper.style.borderRadius = '8px';
    wrapper.style.padding = '8px';
    
    const label = document.createElement('span');
    label.innerText = `${i + 1}번 풍선`;
    label.style.fontSize = '0.7rem';
    label.style.fontWeight = '700';
    label.style.color = 'var(--text-muted)';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `modal-prize-input-${i}`;
    input.value = serverPrizes[i] || '';
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
    
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    modalInputsGrid.appendChild(wrapper);
  }
}

// Hook up opening event
editPrizesBtn.addEventListener('click', () => {
  sounds.init();
  buildEditorInputs();
  editPrizesOverlay.classList.add('active');
});

// Hook up closing event
editCloseBtn.addEventListener('click', () => {
  editPrizesOverlay.classList.remove('active');
});

editPrizesOverlay.addEventListener('click', (e) => {
  if (e.target === editPrizesOverlay) {
    editPrizesOverlay.classList.remove('active');
  }
});

// Preset event
editPresetBtn.addEventListener('click', () => {
  const balancedPreset = [
    "스타벅스 커피", "문화상품권 1만원", "꽝 (아쉬워요!)", "치킨 쿠폰", "꽝 (아쉬워요!)",
    "꽝 (아쉬워요!)", "베스킨라빈스 싱글", "스타벅스 커피", "꽝 (아쉬워요!)", "문화상품권 1만원",
    "신세계 상품권 3만원", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)",
    "치킨 쿠폰", "꽝 (아쉬워요!)", "문화상품권 1만원", "꽝 (아쉬워요!)", "베스킨라빈스 싱글",
    "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "대박! 에어팟 프로"
  ];
  for (let i = 0; i < 25; i++) {
    const input = document.getElementById(`modal-prize-input-${i}`);
    if (input) {
      input.value = balancedPreset[i];
    }
  }
});

// Save event
editSaveBtn.addEventListener('click', () => {
  const updatedPrizes = [];
  for (let i = 0; i < 25; i++) {
    const input = document.getElementById(`modal-prize-input-${i}`);
    updatedPrizes.push(input ? input.value.trim() || '꽝' : '꽝');
  }
  socket.emit('admin-update-prizes', updatedPrizes);
  editPrizesOverlay.classList.remove('active');
  alert("🎉 경품 수정사항이 성공적으로 저장 및 실시간 live 동기화되었습니다!");
});
