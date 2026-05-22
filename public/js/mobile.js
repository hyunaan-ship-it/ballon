// Real-Time Motion Balloon Popping Game - Mobile Script
const socket = io();

// State variables
let canThrow = true;
let hasMotionPermission = false;
let shakeThreshold = 22; // m/s^2 acceleration magnitude for swing
let lastThrowTime = 0;
const THROW_COOLDOWN = 2200; // Cooldown matching host flight and reveal

// Touch coordinates
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

// DOM Elements
const connectionBadge = document.getElementById('connection-badge');
const badgeText = document.getElementById('badge-text');
const dartPin = document.getElementById('dart-pin');
const throwArena = document.getElementById('throw-arena');
const powerFill = document.getElementById('power-fill');
const powerVal = document.getElementById('power-val');
const resultOverlay = document.getElementById('result-overlay');
const resultPrize = document.getElementById('result-prize');
const resultConfirmBtn = document.getElementById('result-confirm-btn');
const permissionOverlay = document.getElementById('permission-overlay');
const requestPermBtn = document.getElementById('request-perm-btn');
const skipPermBtn = document.getElementById('skip-perm-btn');

// Haptic feedback helper
function triggerHaptic(type) {
  if (!('vibrate' in navigator)) return;
  try {
    if (type === 'throw') {
      navigator.vibrate(80); // Short pulse for launch
    } else if (type === 'hit') {
      navigator.vibrate([40, 40, 150]); // Pop-pop-impact pattern
    } else if (type === 'reset') {
      navigator.vibrate(50);
    }
  } catch (e) {
    console.warn("Haptic feedback not supported on this browser/device setup:", e);
  }
}

// Update the visually pleasing live power meter
function updatePowerBar(percent) {
  const capped = Math.min(100, Math.max(0, percent));
  powerFill.style.width = `${capped}%`;
  powerVal.innerText = `${capped}%`;
}

// Trigger standard throw action and sync to server
function triggerThrow(intensity = 1.0) {
  if (!canThrow) return;
  
  const now = Date.now();
  if (now - lastThrowTime < THROW_COOLDOWN) return;
  
  lastThrowTime = now;
  canThrow = false;
  
  // Haptic feedback on launch
  triggerHaptic('throw');
  
  // Animate Dart Flying upwards off the mobile screen
  dartPin.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease-out';
  dartPin.style.transform = 'translateY(-150vh) rotate(-45deg) scale(0.2)';
  dartPin.style.opacity = '0';
  
  // Emit event to Node.js backend
  socket.emit('mobile-throw', {
    intensity: parseFloat(intensity.toFixed(2))
  });
  
  // Visual power confirmation
  updatePowerBar(Math.floor(intensity * 40));
}

// Reset Dart back to hand
function resetDartVisuals() {
  dartPin.style.transition = 'none';
  dartPin.style.transform = 'translateY(100px) scale(0)';
  dartPin.style.opacity = '0';
  
  // Force redraw
  void dartPin.offsetWidth;
  
  // Animate rising up smoothly back to starting position
  dartPin.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease-out';
  dartPin.style.transform = 'translateY(0) rotate(0deg) scale(1)';
  dartPin.style.opacity = '1';
  
  updatePowerBar(0);
  canThrow = true;
}

// Motion sensor accelerometers handling
function handleDeviceMotion(event) {
  if (!canThrow) return;
  
  const acc = event.acceleration || event.accelerationIncludingGravity;
  if (!acc) return;
  
  const x = acc.x || 0;
  const y = acc.y || 0;
  const z = acc.z || 0;
  
  // Calculate total acceleration magnitude (tri-axial vector)
  const magnitude = Math.sqrt(x*x + y*y + z*z);
  
  // Provide minor power meter updates when shaking slightly
  if (magnitude > 5) {
    const rawPower = Math.min(100, Math.floor((magnitude / shakeThreshold) * 100));
    updatePowerBar(rawPower);
  }
  
  // Trigger a launch if force crosses heavy threshold
  if (magnitude > shakeThreshold) {
    const intensity = Math.min(2.5, magnitude / shakeThreshold);
    triggerThrow(intensity);
  }
}

// Check if DeviceMotion needs explicit permissions (e.g. iOS Safari)
function checkMotionSensors() {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const needsPermissionRequest = typeof DeviceMotionEvent !== 'undefined' && 
                                 typeof DeviceMotionEvent.requestPermission === 'function';
  
  if (needsPermissionRequest) {
    // Show iOS permission modal
    permissionOverlay.style.display = 'flex';
  } else {
    // Android / Desktop auto-activates standard listeners
    window.addEventListener('devicemotion', handleDeviceMotion, true);
    hasMotionPermission = true;
  }
}

// Touch controls & Swipe mechanics (Robust fallback + intuitive gesture)
dartPin.addEventListener('touchstart', (e) => {
  if (!canThrow) return;
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
  touchStartTime = Date.now();
  
  dartPin.style.transition = 'none';
  triggerHaptic('reset');
}, { passive: true });

dartPin.addEventListener('touchmove', (e) => {
  if (!canThrow) return;
  const touch = e.touches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  
  // Dampen swipe dragging to give tactile gravity weight
  if (dy < 0) {
    const dampY = dy * 0.35;
    const dampX = dx * 0.15;
    dartPin.style.transform = `translate(${dampX}px, ${dampY}px) scale(0.96)`;
    
    // Update live power bar based on swiped displacement
    const swipePower = Math.min(100, Math.floor((Math.abs(dy) / 220) * 100));
    updatePowerBar(swipePower);
  }
}, { passive: true });

dartPin.addEventListener('touchend', (e) => {
  if (!canThrow) return;
  const touch = e.changedTouches[0];
  const dy = touch.clientY - touchStartY;
  const dt = Date.now() - touchStartTime;
  
  // If user swiped upwards fast and deep enough
  if (dy < -70 && dt < 450) {
    const speed = Math.abs(dy) / dt; // velocity in pixels/ms
    const intensity = Math.min(2.5, speed * 0.4);
    triggerThrow(intensity);
  } else {
    // Snap back elastically if release wasn't solid
    dartPin.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    dartPin.style.transform = 'translate(0, 0) scale(1)';
    updatePowerBar(0);
  }
}, { passive: true });

// UI Event Buttons
requestPermBtn.addEventListener('click', () => {
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission()
      .then(response => {
        if (response === 'granted') {
          window.addEventListener('devicemotion', handleDeviceMotion, true);
          hasMotionPermission = true;
          alert("모션 센서가 성공적으로 승인되었습니다! 스마트폰을 휘둘러 던지실 수 있습니다.");
        } else {
          alert("센서 승인이 거부되었습니다. 드래그(밀어서) 던지기로 게임을 진행합니다.");
        }
        permissionOverlay.style.display = 'none';
      })
      .catch(err => {
        console.error("iOS Motion Sensor Request Error:", err);
        permissionOverlay.style.display = 'none';
      });
  } else {
    permissionOverlay.style.display = 'none';
  }
});

skipPermBtn.addEventListener('click', () => {
  permissionOverlay.style.display = 'none';
});

resultConfirmBtn.addEventListener('click', () => {
  resultOverlay.classList.remove('active');
  resetDartVisuals();
});

// Socket Event listeners
socket.on('connect', () => {
  console.log("Mobile socket connected");
  socket.emit('join-mobile');
  
  // Set badge to connected state
  connectionBadge.className = 'connection-badge';
  badgeText.innerText = '다트 연결됨';
});

socket.on('disconnect', () => {
  console.log("Mobile socket disconnected");
  connectionBadge.className = 'connection-badge disconnected';
  badgeText.innerText = '연결 차단됨';
});

// Receive result from backend throw request
socket.on('throw-result', (data) => {
  if (data.status === 'success') {
    triggerHaptic('hit');
    
    // Show winner result overlay card
    setTimeout(() => {
      resultPrize.innerText = data.prize;
      resultOverlay.classList.add('active');
    }, 700);
  } else {
    alert(data.message || "오류가 발생했습니다!");
    resetDartVisuals();
  }
});

// Reset command from host resets mobile too
socket.on('board-reset', () => {
  resultOverlay.classList.remove('active');
  resetDartVisuals();
});

// Check hardware triggers on load
checkMotionSensors();
