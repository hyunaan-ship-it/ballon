// Real-Time Motion Balloon Popping Game - Mobile Script
// Connection is dynamically managed by SyncHelper below.

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

// Device orientation (tilt) for targeting
let deviceTilt = { x: 0, y: 0 };
let currentPrize = null;

// Neutral orientation state (calibrated for phone holding angle)
let neutralBeta = parseFloat(localStorage.getItem('calibrated_beta')) || 55;
let neutralGamma = parseFloat(localStorage.getItem('calibrated_gamma')) || 0;
let currentBeta = 55;
let currentGamma = 0;
let tiltHistory = [];
const TILT_HISTORY_LIMIT = 10;

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
const winnerInfoForm = document.getElementById('winner-info-form');
const employeeIdInput = document.getElementById('employee-id');
const phoneNumberInput = document.getElementById('phone-number');
const submitWinnerBtn = document.getElementById('submit-winner-btn');

if (phoneNumberInput) {
  phoneNumberInput.addEventListener('input', (e) => {
    let val = e.target.value.replace(/[^0-9]/g, '');
    let formatted = '';
    if (val.length <= 3) {
      formatted = val;
    } else if (val.length <= 7) {
      formatted = val.slice(0, 3) + '-' + val.slice(3);
    } else {
      formatted = val.slice(0, 3) + '-' + val.slice(3, 7) + '-' + val.slice(7, 11);
    }
    e.target.value = formatted;
  });
}


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
function triggerThrow(intensity = 1.0, isSwipe = false) {
  if (!canThrow) return;
  
  const now = Date.now();
  if (now - lastThrowTime < THROW_COOLDOWN) return;
  
  lastThrowTime = now;
  canThrow = false;
  
  // Disable all pointer interactions on the screen to prevent double throws
  document.body.style.pointerEvents = 'none';
  
  // Haptic feedback on launch
  triggerHaptic('throw');
  
  // Animate Dart Flying upwards off the mobile screen
  dartPin.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease-out';
  dartPin.style.transform = 'translateY(-150vh) rotate(-45deg) scale(0.2)';
  dartPin.style.opacity = '0';
  
  // Use historical tilt from ~200ms ago for motion throw, current tilt for swipe throw
  const throwingTilt = (isSwipe || tiltHistory.length === 0) ? deviceTilt : tiltHistory[0];
  
  // Sync with unified SyncHelper layer (include tilt data)
  SyncHelper.throwDart(parseFloat(intensity.toFixed(2)), { tilt: throwingTilt }, (data) => {
    handleThrowResult(data);
  });
  
  // Visual power confirmation
  updatePowerBar(Math.floor(intensity * 40));
}

// Reset Dart back to hand
function resetDartVisuals() {
  dartPin.style.transition = 'none';
  dartPin.style.transform = 'translateY(100px) scale(0)';
  dartPin.style.opacity = '0';
  
  // Hide result image
  const prizeImg = document.getElementById('result-prize-image');
  if (prizeImg) {
    prizeImg.style.display = 'none';
    prizeImg.src = '';
  }
  
  // Force redraw
  void dartPin.offsetWidth;
  
  // Animate rising up smoothly back to starting position
  dartPin.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease-out';
  dartPin.style.transform = 'translateY(0) rotate(0deg) scale(1)';
  dartPin.style.opacity = '1';
  
  updatePowerBar(0);
  
  // Re-enable pointer interactions
  document.body.style.pointerEvents = 'auto';
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
    triggerThrow(intensity, false);
  }
}

// Build aim grid dynamically on mobile screen
const aimGrid = document.getElementById('aim-grid');
if (aimGrid) {
  for (let i = 0; i < 25; i++) {
    const cell = document.createElement('div');
    cell.className = 'aim-cell';
    cell.id = `aim-cell-${i}`;
    aimGrid.appendChild(cell);
  }
}

let mobilePoppedState = Array(25).fill(false);

function updateAimVisualizer() {
  const col = Math.max(0, Math.min(4, Math.floor(((deviceTilt.x + 1) / 2) * 5)));
  const row = Math.max(0, Math.min(4, Math.floor(((deviceTilt.y + 1) / 2) * 5)));
  const tiltedIndex = row * 5 + col;
  
  for (let i = 0; i < 25; i++) {
    const cell = document.getElementById(`aim-cell-${i}`);
    if (cell) {
      cell.className = 'aim-cell';
      if (mobilePoppedState[i]) {
        cell.classList.add('popped');
      }
      if (i === tiltedIndex) {
        cell.classList.add('target');
      }
    }
  }
}

// Device orientation handling for tilt-based targeting (calibrated for natural phone hold)
function handleDeviceOrientation(event) {
  // beta: front-to-back tilt (-180 to 180), gamma: left-to-right tilt (-90 to 90)
  const gamma = event.gamma || 0;
  const beta = event.beta || 0;
  
  // Track current orientation values for calibration
  currentBeta = beta;
  currentGamma = gamma;
  
  // Dynamic neutral holding state based on calibration
  const sensitivityX = 20;
  const sensitivityY = 18; // Adjusted from 25 to 18 to make vertical aiming easier (difficulty adjust)
  
  const normalizedX = (gamma - neutralGamma) / sensitivityX;
  const normalizedY = -(beta - neutralBeta) / sensitivityY;
  
  // Clamp to -1 to 1
  deviceTilt.x = Math.max(-1, Math.min(1, normalizedX));
  deviceTilt.y = Math.max(-1, Math.min(1, normalizedY));
  
  // Push to history buffer to counteract wrist rotation
  tiltHistory.push({ x: deviceTilt.x, y: deviceTilt.y });
  if (tiltHistory.length > TILT_HISTORY_LIMIT) {
    tiltHistory.shift();
  }
  
  updateAimVisualizer();
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
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
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
    triggerThrow(intensity, true);
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
          window.addEventListener('deviceorientation', handleDeviceOrientation, true);
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
  SyncHelper.confirmPrizeClaim();
});

// Winner info form submission
submitWinnerBtn.addEventListener('click', () => {
  const employeeId = employeeIdInput.value.trim();
  const phoneNumber = phoneNumberInput.value.trim();
  
  if (!employeeId || !phoneNumber) {
    alert('사번과 전화번호를 모두 입력해주세요.');
    return;
  }

  const phoneRegex = /^010-\d{3,4}-\d{4}$/;
  if (!phoneRegex.test(phoneNumber)) {
    alert('전화번호는 010-1234-1234 형식으로 입력해주세요.');
    return;
  }
  
  // Disable button to prevent double submit
  submitWinnerBtn.disabled = true;
  submitWinnerBtn.innerText = '제출 중...';
  
  SyncHelper.submitWinnerInfo(employeeId, phoneNumber, currentPrize, (response) => {
    submitWinnerBtn.disabled = false;
    submitWinnerBtn.innerText = '정보 제출하기';
    if (response.status === 'success') {
      // 입력 폼 초기화
      winnerInfoForm.style.display = 'none';
      employeeIdInput.value = '';
      phoneNumberInput.value = '';
      // 컴퓨터 화면도 다음 단계로 전환 (prize-confirmed 브로드캐스트)
      SyncHelper.confirmPrizeClaim();
      // 핸드폰 오버레이 닫고 다트 재세팅
      resultOverlay.classList.remove('active');
      resetDartVisuals();
    } else {
      alert(response.message || '제출 중 오류가 발생했습니다.');
    }
  });
});

// Receive result from backend or Firebase throw request
function handleThrowResult(data) {
  const resultTitle = document.getElementById('result-title');
  const resultDesc = document.getElementById('result-desc');
  const prizeImg = document.getElementById('result-prize-image');
  
  // Re-enable pointer interactions when response arrives
  document.body.style.pointerEvents = 'auto';
  
  if (data.status === 'success') {
    triggerHaptic('hit');
    
    const parsed = parsePrize(data.prize);
    currentPrize = parsed.text;
    
    // Show winner result overlay card
    setTimeout(() => {
      if (resultTitle) resultTitle.innerText = "🎯 다트 명중!";
      if (resultDesc) resultDesc.innerText = "획득한 경품은 바로...";
      resultPrize.innerText = parsed.text;
      
      if (prizeImg) {
        if (parsed.image) {
          prizeImg.src = parsed.image;
          prizeImg.style.display = 'block';
        } else {
          prizeImg.style.display = 'none';
        }
      }
      
      resultOverlay.classList.add('active');
      
      // Show winner info form if prize requires winner info (checked by admin)
      if (data.requireWinnerInfo) {
        winnerInfoForm.style.display = 'block';
        resultConfirmBtn.style.display = 'none';
      } else {
        winnerInfoForm.style.display = 'none';
        resultConfirmBtn.style.display = 'block';
      }
    }, 700);
  } else if (data.status === 'miss') {
    triggerHaptic('throw'); // Short haptic pulse
    
    // Show miss result overlay card
    setTimeout(() => {
      if (resultTitle) resultTitle.innerText = "❌ 조준 실패!";
      if (resultDesc) resultDesc.innerText = "아쉽게도 풍선을 비껴갔습니다.";
      resultPrize.innerText = "다시 조준해서 던져보세요!";
      if (prizeImg) prizeImg.style.display = 'none';
      resultOverlay.classList.add('active');
      winnerInfoForm.style.display = 'none';
      resultConfirmBtn.style.display = 'block';
    }, 700);
  } else {
    alert(data.message || "오류가 발생했습니다!");
    resetDartVisuals();
  }
}

// --- Account Selection Overlay Routing ---
const urlParams = new URLSearchParams(window.location.search);
let accountId = urlParams.get('account');
let room = urlParams.get('room') || getOrGenerateRoomId();

const accountOverlay = document.getElementById('account-select-overlay');

if (!accountId) {
  // Show stunning glass selector overlay
  accountOverlay.style.display = 'flex';
  
  document.querySelectorAll('.account-card-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedAcc = btn.getAttribute('data-account');
      window.location.search = `?room=${room}&account=${selectedAcc}`;
    });
  });
} else {
  // Dismiss selector
  accountOverlay.style.display = 'none';
  
  // Set badge connection loading state
  connectionBadge.className = 'connection-badge disconnected';
  badgeText.innerText = '연결 시도 중...';
  
  // Calibrate button event listener
  const calibrateBtn = document.getElementById('calibrate-btn');
  if (calibrateBtn) {
    calibrateBtn.addEventListener('click', () => {
      neutralBeta = currentBeta;
      neutralGamma = currentGamma;
      localStorage.setItem('calibrated_beta', neutralBeta);
      localStorage.setItem('calibrated_gamma', neutralGamma);
      
      triggerHaptic('reset');
      
      const originalText = calibrateBtn.innerHTML;
      calibrateBtn.innerText = '✅ 보정 완료!';
      calibrateBtn.style.borderColor = '#00e676';
      calibrateBtn.style.color = '#00e676';
      
      setTimeout(() => {
        calibrateBtn.innerHTML = originalText;
        calibrateBtn.style.borderColor = 'rgba(0, 242, 254, 0.25)';
        calibrateBtn.style.color = 'var(--accent-cyan)';
      }, 1200);
      
      console.log(`Calibrated center: neutralBeta = ${neutralBeta}, neutralGamma = ${neutralGamma}`);
    });
  }
  
  // Initialize Unified Sync Layer!
  SyncHelper.init({
    role: 'mobile',
    accountId: accountId,
    onInit: (data) => {
      connectionBadge.className = 'connection-badge';
      badgeText.innerText = `연결됨 (계정 ${accountId})`;
      console.log(`Mobile SyncHelper successfully established connection for Account ${accountId}`);
      if (data && data.popped) {
        let popped = data.popped;
        if (typeof popped === 'string') {
          try { popped = JSON.parse(popped); } catch (e) {}
        }
        mobilePoppedState = Array.isArray(popped) ? popped : Array(25).fill(false);
        updateAimVisualizer();
      }
    },
    onStateUpdate: (data) => {
      if (data && data.popped) {
        let popped = data.popped;
        if (typeof popped === 'string') {
          try { popped = JSON.parse(popped); } catch (e) {}
        }
        mobilePoppedState = Array.isArray(popped) ? popped : Array(25).fill(false);
        updateAimVisualizer();
      }
    },
    onReset: () => {
      resultOverlay.classList.remove('active');
      resetDartVisuals();
      mobilePoppedState = Array(25).fill(false);
      updateAimVisualizer();
    },
    onPrizeConfirmed: () => {
      resultOverlay.classList.remove('active');
      resetDartVisuals();
    },
    onDisconnect: (reason) => {
      connectionBadge.className = 'connection-badge disconnected';
      badgeText.innerText = '연결 끊김 (재연결 중...)';
    },
    onConnect: () => {
      connectionBadge.className = 'connection-badge';
      badgeText.innerText = `연결됨 (계정 ${accountId})`;
    }
  });
}

// Check hardware triggers on load
checkMotionSensors();
