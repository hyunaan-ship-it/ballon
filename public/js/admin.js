// Real-Time Motion Balloon Popping Game - Admin Script
// Connection is dynamically managed by SyncHelper below.

// Store live states
let currentPrizes = [];
let currentPopped = [];
let currentRequireWinnerInfo = [];

const adminPrizeGrid = document.getElementById('admin-prize-grid');
const prizeForm = document.getElementById('prize-form');
const saveBtn = document.getElementById('save-prizes-btn');
const opResetBtn = document.getElementById('op-reset');
const opShuffleBtn = document.getElementById('op-shuffle');
const downloadCsvBtn = document.getElementById('download-csv-btn');
const clearWinnersBtn = document.getElementById('clear-winners-btn');
const winnersCountDiv = document.getElementById('winners-count');
const toggleAllWinnerInfo = document.getElementById('toggle-all-winner-info');

// Quick Presets
const presetBalancedBtn = document.getElementById('preset-balanced');
const presetGenerousBtn = document.getElementById('preset-generous');
const presetBlankBtn = document.getElementById('preset-blank');

// Build 25 modular input cards
function buildGridStructure() {
  adminPrizeGrid.innerHTML = '';
  
  for (let i = 0; i < 25; i++) {
    const cell = document.createElement('div');
    cell.className = 'prize-input-cell';
    cell.id = `admin-cell-${i}`;
    
    const indexTag = document.createElement('span');
    indexTag.className = 'cell-index';
    indexTag.innerText = `${i + 1}번 풍선`;
    
    const statusTag = document.createElement('span');
    statusTag.className = 'cell-status-tag status-active';
    statusTag.id = `status-tag-${i}`;
    statusTag.innerText = '🎈 활성';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'prize-field';
    input.id = `prize-input-${i}`;
    input.placeholder = `경품 내용을 입력하세요`;
    input.required = true;
    
    // Copy-Paste Image Container
    const imgContainer = document.createElement('div');
    imgContainer.className = 'prize-image-container';
    
    const pasteZone = document.createElement('div');
    pasteZone.className = 'prize-image-paste-zone';
    pasteZone.tabIndex = 0;
    pasteZone.innerText = '📋 이미지 붙여넣기 (Ctrl+V)';
    
    const previewDiv = document.createElement('div');
    previewDiv.className = 'prize-image-preview';
    previewDiv.style.display = 'none';
    
    const previewImg = document.createElement('img');
    previewImg.id = `prize-image-preview-img-${i}`;
    
    const removeImgBtn = document.createElement('button');
    removeImgBtn.className = 'remove-image-btn';
    removeImgBtn.type = 'button';
    removeImgBtn.innerText = '×';
    removeImgBtn.title = '이미지 삭제';
    
    previewDiv.appendChild(previewImg);
    previewDiv.appendChild(removeImgBtn);
    
    imgContainer.appendChild(pasteZone);
    imgContainer.appendChild(previewDiv);
    
    // Winner info checkbox
    const checkboxContainer = document.createElement('div');
    checkboxContainer.style.display = 'flex';
    checkboxContainer.style.alignItems = 'center';
    checkboxContainer.style.gap = '6px';
    checkboxContainer.style.marginTop = '8px';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `require-winner-info-${i}`;
    checkbox.className = 'winner-info-checkbox';
    checkbox.style.width = '16px';
    checkbox.style.height = '16px';
    checkbox.style.cursor = 'pointer';
    
    const checkboxLabel = document.createElement('label');
    checkboxLabel.htmlFor = `require-winner-info-${i}`;
    checkboxLabel.style.fontSize = '0.75rem';
    checkboxLabel.style.color = 'var(--text-secondary)';
    checkboxLabel.style.cursor = 'pointer';
    checkboxLabel.innerText = '당첨자 정보 입력 필요';
    
    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(checkboxLabel);
    
    cell.appendChild(indexTag);
    cell.appendChild(statusTag);
    cell.appendChild(input);
    cell.appendChild(imgContainer);
    cell.appendChild(checkboxContainer);
    
    // Paste handler for clipboard image with safety and canvas compression
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
              cell.dataset.image = compressedBase64;
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
    
    pasteZone.addEventListener('click', () => {
      pasteZone.focus();
    });
    
    removeImgBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cell.removeAttribute('data-image');
      previewImg.src = '';
      previewDiv.style.display = 'none';
      pasteZone.style.display = 'flex';
    });
    
    adminPrizeGrid.appendChild(cell);
  }
}

// Update inputs and badges with server data
function syncUIWithData() {
  for (let i = 0; i < 25; i++) {
    const input = document.getElementById(`prize-input-${i}`);
    const statusTag = document.getElementById(`status-tag-${i}`);
    const cell = document.getElementById(`admin-cell-${i}`);
    const checkbox = document.getElementById(`require-winner-info-${i}`);
    
    const prizeData = parsePrize(currentPrizes[i]);
    
    if (input) {
      input.value = prizeData.text || '';
    }
    
    if (cell) {
      const previewImg = document.getElementById(`prize-image-preview-img-${i}`);
      const previewDiv = cell.querySelector('.prize-image-preview');
      const pasteZone = cell.querySelector('.prize-image-paste-zone');
      
      if (prizeData.image) {
        cell.dataset.image = prizeData.image;
        if (previewImg) previewImg.src = prizeData.image;
        if (previewDiv) previewDiv.style.display = 'flex';
        if (pasteZone) pasteZone.style.display = 'none';
      } else {
        cell.removeAttribute('data-image');
        if (previewImg) previewImg.src = '';
        if (previewDiv) previewDiv.style.display = 'none';
        if (pasteZone) pasteZone.style.display = 'flex';
      }
    }
    
    if (checkbox) {
      checkbox.checked = currentRequireWinnerInfo[i] || false;
    }
    
    if (statusTag && cell) {
      if (currentPopped[i]) {
        cell.className = 'prize-input-cell cell-popped';
        statusTag.className = 'cell-status-tag status-popped';
        statusTag.innerHTML = '💥 터짐 (복구)';
        
        // Remove previous listeners and add dynamic single unpop listener
        statusTag.onclick = (e) => {
          e.preventDefault();
          if (confirm(`${i + 1}번 풍선을 다시 살아있는(안 터진) 상태로 복구하시겠습니까?`)) {
            SyncHelper.togglePop(i);
          }
        };
      } else {
        cell.className = 'prize-input-cell';
        statusTag.className = 'cell-status-tag status-active';
        statusTag.innerHTML = '🎈 활성';
        statusTag.onclick = null;
      }
    }
  }
  
  if (toggleAllWinnerInfo) {
    const allChecked = currentRequireWinnerInfo.length === 25 && currentRequireWinnerInfo.every(val => val === true);
    toggleAllWinnerInfo.checked = allChecked;
  }
}

// Preset Generators
function applyPreset(presetArray) {
  for (let i = 0; i < 25; i++) {
    const input = document.getElementById(`prize-input-${i}`);
    const cell = document.getElementById(`admin-cell-${i}`);
    const parsed = parsePrize(presetArray[i]);
    
    if (input) {
      input.value = parsed.text;
    }
    
    if (cell) {
      const previewImg = document.getElementById(`prize-image-preview-img-${i}`);
      const previewDiv = cell.querySelector('.prize-image-preview');
      const pasteZone = cell.querySelector('.prize-image-paste-zone');
      
      if (parsed.image) {
        cell.dataset.image = parsed.image;
        if (previewImg) previewImg.src = parsed.image;
        if (previewDiv) previewDiv.style.display = 'flex';
        if (pasteZone) pasteZone.style.display = 'none';
      } else {
        cell.removeAttribute('data-image');
        if (previewImg) previewImg.src = '';
        if (previewDiv) previewDiv.style.display = 'none';
        if (pasteZone) pasteZone.style.display = 'flex';
      }
    }
  }
  // Soft highlight on inputs to show change
  const fields = document.querySelectorAll('.prize-field');
  fields.forEach(f => {
    f.style.borderColor = 'var(--accent-purple)';
    setTimeout(() => {
      f.style.borderColor = '';
    }, 1000);
  });
}

// Preset Distributions
const balancedPreset = [
  "스타벅스 커피", "문화상품권 1만원", "꽝 (아쉬워요!)", "치킨 쿠폰", "꽝 (아쉬워요!)",
  "꽝 (아쉬워요!)", "베스킨라빈스 싱글", "스타벅스 커피", "꽝 (아쉬워요!)", "문화상품권 1만원",
  "신세계 상품권 3만원", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)",
  "치킨 쿠폰", "꽝 (아쉬워요!)", "문화상품권 1만원", "꽝 (아쉬워요!)", "베스킨라빈스 싱글",
  "꽝 (아쉬워요!)", "스타벅스 커피", "꽝 (아쉬워요!)", "꽝 (아쉬워요!)", "대박! 에어팟 프로"
];

const generousPreset = [
  "스타벅스 커피", "문화상품권 1만원", "베스킨라빈스 싱글", "치킨 쿠폰", "신세계 3만원",
  "스타벅스 커피", "문화상품권 1만원", "영화 관람권", "치킨 쿠폰", "베스킨라빈스 싱글",
  "신세계 5만원", "스타벅스 커피", "문화상품권 1만원", "영화 관람권", "치킨 쿠폰",
  "베스킨라빈스 싱글", "스타벅스 커피", "문화상품권 1만원", "영화 관람권", "치킨 쿠폰",
  "편의점 5천원권", "스타벅스 커피", "베스킨라빈스 싱글", "편의점 5천원권", "대박! 에어팟 프로"
];

const blankPreset = Array(25).fill("꽝 (아쉬워요!)");

// Register Preset Button actions
presetBalancedBtn.addEventListener('click', () => {
  if (confirm("균형잡힌 이벤트 프리셋을 입력창에 채우시겠습니까? (최종 적용하려면 경품 저장 버튼을 눌러주세요)")) {
    applyPreset(balancedPreset);
  }
});

presetGenerousBtn.addEventListener('click', () => {
  if (confirm("꽝이 없는 푸짐한 프리셋을 입력창에 채우시겠습니까? (최종 적용하려면 경품 저장 버튼을 눌러주세요)")) {
    applyPreset(generousPreset);
  }
});

presetBlankBtn.addEventListener('click', () => {
  if (confirm("모든 경품을 '꽝 (아쉬워요!)'으로 비우시겠습니까? (최종 적용하려면 경품 저장 버튼을 눌러주세요)")) {
    applyPreset(blankPreset);
  }
});

// Save all prizes and settings
saveBtn.addEventListener('click', (e) => {
  e.preventDefault();
  
  const updatedPrizes = [];
  let hasEmpty = false;
  
  for (let i = 0; i < 25; i++) {
    const input = document.getElementById(`prize-input-${i}`);
    const cell = document.getElementById(`admin-cell-${i}`);
    const textVal = input ? input.value.trim() : "";
    const imgVal = cell ? cell.dataset.image || "" : "";
    
    if (!textVal && !imgVal) {
      hasEmpty = true;
    }
    
    let prizeVal = textVal || "꽝";
    if (imgVal) {
      prizeVal = JSON.stringify({ text: textVal, image: imgVal });
    }
    updatedPrizes.push(prizeVal);
  }
  
  if (hasEmpty) {
    if (!confirm("경품명 중 빈 칸이 있습니다. 빈 칸은 자동으로 '꽝'으로 처리되어 저장됩니다. 진행할까요?")) {
      return;
    }
  }

  const requireWinnerInfo = [];
  for (let i = 0; i < 25; i++) {
    const checkbox = document.getElementById(`require-winner-info-${i}`);
    requireWinnerInfo.push(checkbox ? checkbox.checked : false);
  }
  
  SyncHelper.updatePrizesAndSettings(updatedPrizes, requireWinnerInfo);
  alert("🎉 경품 및 설정이 성공적으로 저장 및 live 동기화되었습니다!");
});

// Reset and Shuffle operations
opResetBtn.addEventListener('click', () => {
  if (confirm("정말 모든 풍선판을 리셋하시겠습니까? (현재 배치된 경품 내용은 그대로 유지됩니다)")) {
    SyncHelper.resetBoard({ shuffle: false });
    alert("풍선판이 정상적으로 초기화되었습니다!");
  }
});

opShuffleBtn.addEventListener('click', () => {
  if (confirm("정말 풍선판 리셋 및 경품 랜덤 셔플을 진행하시겠습니까? (경품들의 위치가 25개 칸에 무작위로 재배치됩니다)")) {
    SyncHelper.resetBoard({ shuffle: true });
    alert("풍선판이 리셋되고 경품들이 무작위로 뒤섞였습니다!");
  }
});

// Master checkbox toggle for requireWinnerInfo
if (toggleAllWinnerInfo) {
  toggleAllWinnerInfo.addEventListener('change', (e) => {
    const checked = e.target.checked;
    for (let i = 0; i < 25; i++) {
      const checkbox = document.getElementById(`require-winner-info-${i}`);
      if (checkbox) checkbox.checked = checked;
    }
  });
}

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

// Filter and download CSV client-side
function downloadWinnersCSV() {
  SyncHelper.getWinners((winners) => {
    const startDateVal = document.getElementById('winner-start-date').value;
    const endDateVal = document.getElementById('winner-end-date').value;
    
    let filteredWinners = winners;
    if (startDateVal) {
      const start = new Date(`${startDateVal}T00:00:00+09:00`);
      filteredWinners = filteredWinners.filter(w => new Date(w.timestamp) >= start);
    }
    if (endDateVal) {
      const end = new Date(`${endDateVal}T23:59:59.999+09:00`);
      filteredWinners = filteredWinners.filter(w => new Date(w.timestamp) <= end);
    }

    if (filteredWinners.length === 0) {
      alert('선택한 기간의 당첨자 정보가 없습니다.');
      return;
    }

    // Generate CSV content
    const headers = ['사번', '전화번호', '상품명', '입력 시간'];
    const rows = filteredWinners.map(w => [
      w.employeeId, 
      formatPhoneNumber(w.phoneNumber), 
      w.prize, 
      w.timestamp ? new Date(w.timestamp).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : (w.timestampFormatted || '')
    ]);
    const csvContent = [headers, ...rows].map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')).join('\n');
    
    // Create Blob and trigger download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv; charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `winners_account_${accountId}_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

// Download CSV functionality
downloadCsvBtn.addEventListener('click', () => {
  downloadWinnersCSV();
});

// Clear winners functionality
if (clearWinnersBtn) {
  clearWinnersBtn.addEventListener('click', () => {
    if (!confirm('당첨자 기록을 전부 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없습니다!')) return;
    SyncHelper.clearWinners((response) => {
      if (response.status === 'success') {
        winnersCountDiv.innerText = '당첨자: 0명';
        alert('당첨자 기록이 전부 삭제되었습니다.');
      } else {
        alert(response.message || '삭제 중 오류가 발생했습니다.');
      }
    });
  });
}

// Load winners count on init or date change
function loadWinnersCount() {
  SyncHelper.getWinners((winners) => {
    const startDateVal = document.getElementById('winner-start-date').value;
    const endDateVal = document.getElementById('winner-end-date').value;
    
    let filteredWinners = winners;
    if (startDateVal) {
      const start = new Date(`${startDateVal}T00:00:00+09:00`);
      filteredWinners = filteredWinners.filter(w => new Date(w.timestamp) >= start);
    }
    if (endDateVal) {
      const end = new Date(`${endDateVal}T23:59:59.999+09:00`);
      filteredWinners = filteredWinners.filter(w => new Date(w.timestamp) <= end);
    }
    
    const count = filteredWinners.length;
    winnersCountDiv.innerText = `당첨자: ${count}명`;
  });
}

// Listen to date changes
const startDateInput = document.getElementById('winner-start-date');
const endDateInput = document.getElementById('winner-end-date');
if (startDateInput) startDateInput.addEventListener('change', loadWinnersCount);
if (endDateInput) endDateInput.addEventListener('change', loadWinnersCount);

// --- Account Selection Overlay & Switcher Routing ---
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
  // Dismiss selector overlay
  accountOverlay.style.display = 'none';
  
  // Highlight active top header switcher pill button
  document.querySelectorAll('.pill-btn').forEach(pill => {
    const acc = pill.getAttribute('data-acc');
    if (acc === accountId) {
      pill.classList.add('active');
    }
    
    pill.addEventListener('click', () => {
      window.location.search = `?room=${room}&account=${acc}`;
    });
  });
  
  // Update view host screen navigation link
  const hostViewLink = document.getElementById('host-view-link');
  if (hostViewLink) {
    hostViewLink.href = `/?room=${room}&account=${accountId}`;
  }
  
  // Initialize Unified Sync Layer!
  SyncHelper.init({
    role: 'admin',
    accountId: accountId,
    onInit: (data) => {
      currentPrizes = data.prizes;
      currentPopped = data.popped;
      currentRequireWinnerInfo = data.requireWinnerInfo || Array(25).fill(false);
      buildGridStructure();
      syncUIWithData();
      loadWinnersCount();
      console.log(`Admin SyncHelper successfully loaded data for Account ${accountId}`);
    },
    onStateUpdate: (data) => {
      currentPrizes = data.prizes;
      currentPopped = data.popped;
      currentRequireWinnerInfo = data.requireWinnerInfo || Array(25).fill(false);
      syncUIWithData();
    },
    onNewWinner: (winner) => {
      loadWinnersCount();
    },
    onWinnersCleared: () => {
      winnersCountDiv.innerText = '당첨자: 0명';
    },
    onDisconnect: (reason) => {
      console.warn("[Admin] Disconnected from server:", reason);
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = '⚠️ 연결 끊김 - 저장 불가';
        saveBtn.style.backgroundColor = '#ff1744';
      }
      if (opResetBtn) opResetBtn.disabled = true;
      if (opShuffleBtn) opShuffleBtn.disabled = true;
      if (clearWinnersBtn) clearWinnersBtn.disabled = true;
    },
    onConnect: () => {
      console.log("[Admin] Connected/Reconnected to server.");
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = '💾 경품 및 설정 저장 & 동기화';
        saveBtn.style.backgroundColor = '';
      }
      if (opResetBtn) opResetBtn.disabled = false;
      if (opShuffleBtn) opShuffleBtn.disabled = false;
      if (clearWinnersBtn) clearWinnersBtn.disabled = false;
    }
  });
}
