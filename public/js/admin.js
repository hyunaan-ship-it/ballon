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
const opClearAllBtn = document.getElementById('op-clear-all');
const downloadCsvBtn = document.getElementById('download-csv-btn');
const clearWinnersBtn = document.getElementById('clear-winners-btn');
const winnersCountDiv = document.getElementById('winners-count');
const toggleAllWinnerInfo = document.getElementById('toggle-all-winner-info');

// Quick Presets
const presetBalancedBtn = document.getElementById('preset-balanced');
const presetGenerousBtn = document.getElementById('preset-generous');
const presetBlankBtn = document.getElementById('preset-blank');

function sanitizeData(prizes, popped, reqWinnerInfo) {
  let cleanPrizes = Array.isArray(prizes) ? [...prizes] : [];
  let grid = (cleanPrizes.length >= 36) ? 6 : 5;
  let targetLen = grid * grid;

  const defaultFillers = [
    "스타벅스 커피", "문화상품권 1만원", "꽝 (아쉬워요!)", "치킨 쿠폰", "베스킨라빈스 싱글", "신세계 상품권 3만원"
  ];
  if (cleanPrizes.length < targetLen) {
    while (cleanPrizes.length < targetLen) {
      cleanPrizes.push(defaultFillers[cleanPrizes.length % defaultFillers.length]);
    }
  } else if (cleanPrizes.length > targetLen) {
    cleanPrizes = cleanPrizes.slice(0, targetLen);
  }

  let cleanPopped = Array.isArray(popped) ? [...popped] : [];
  if (cleanPopped.length < targetLen) {
    while (cleanPopped.length < targetLen) cleanPopped.push(false);
  } else if (cleanPopped.length > targetLen) {
    cleanPopped = cleanPopped.slice(0, targetLen);
  }

  let cleanReq = Array.isArray(reqWinnerInfo) ? [...reqWinnerInfo] : [];
  if (cleanReq.length < targetLen) {
    while (cleanReq.length < targetLen) cleanReq.push(false);
  } else if (cleanReq.length > targetLen) {
    cleanReq = cleanReq.slice(0, targetLen);
  }

  return { prizes: cleanPrizes, popped: cleanPopped, requireWinnerInfo: cleanReq, gridSize: grid };
}

// Build modular input cards
function buildGridStructure() {
  adminPrizeGrid.innerHTML = '';
  const sanitized = sanitizeData(currentPrizes, currentPopped, currentRequireWinnerInfo);
  currentPrizes = sanitized.prizes;
  currentPopped = sanitized.popped;
  currentRequireWinnerInfo = sanitized.requireWinnerInfo;

  const size = currentPrizes.length;
  const gridSize = sanitized.gridSize;
  adminPrizeGrid.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
  
  for (let i = 0; i < size; i++) {
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
  const size = currentPrizes.length;
  updateSectionTitle();

  for (let i = 0; i < size; i++) {
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
    const allChecked = currentRequireWinnerInfo.length === size && currentRequireWinnerInfo.every(val => val === true);
    toggleAllWinnerInfo.checked = allChecked;
  }
}

function updateSectionTitle() {
  const size = currentPrizes.length || 25;
  const gridSize = (size >= 36) ? 6 : 5;
  const titleEl = document.querySelector('.prize-edit-panel h2');
  if (titleEl) {
    titleEl.innerText = `🎈 ${gridSize} x ${gridSize} 풍선별 경품 편집`;
  }
  
  // Also toggle active class on size buttons
  const btn5 = document.getElementById('grid-size-5x5-btn');
  const btn6 = document.getElementById('grid-size-6x6-btn');
  if (btn5 && btn6) {
    if (gridSize === 5) {
      btn5.classList.add('active');
      btn6.classList.remove('active');
    } else {
      btn6.classList.add('active');
      btn5.classList.remove('active');
    }
  }
}

// Preset Generators
function applyPreset(presetArray) {
  const size = currentPrizes.length;
  for (let i = 0; i < size; i++) {
    const input = document.getElementById(`prize-input-${i}`);
    const cell = document.getElementById(`admin-cell-${i}`);
    const parsed = parsePrize(presetArray[i] || "꽝 (아쉬워요!)");
    
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

function getBalancedPreset(size) {
  const basePrizes = [
    "스타벅스 커피", "문화상품권 1만원", "치킨 쿠폰", "베스킨라빈스 싱글", "신세계 상품권 3만원", "대박! 에어팟 프로"
  ];
  const balanced = [];
  for (let i = 0; i < size; i++) {
    if (i % 6 === 0) {
      balanced.push(basePrizes[0]);
    } else if (i % 8 === 1) {
      balanced.push(basePrizes[1]);
    } else if (i % 12 === 2) {
      balanced.push(basePrizes[2]);
    } else if (i % 9 === 3) {
      balanced.push(basePrizes[3]);
    } else if (i % 18 === 4) {
      balanced.push(basePrizes[4]);
    } else if (i === size - 1) {
      balanced.push(basePrizes[5]);
    } else {
      balanced.push("꽝 (아쉬워요!)");
    }
  }
  return balanced;
}

function getGenerousPreset(size) {
  const basePrizes = [
    "스타벅스 커피", "문화상품권 1만원", "베스킨라빈스 싱글", "치킨 쿠폰", "신세계 3만원",
    "영화 관람권", "신세계 5만원", "편의점 5천원권", "대박! 에어팟 프로"
  ];
  const generous = [];
  for (let i = 0; i < size; i++) {
    if (i === size - 1) {
      generous.push(basePrizes[8]);
    } else {
      const idx = i % 8;
      generous.push(basePrizes[idx]);
    }
  }
  return generous;
}

// Register Preset Button actions
presetBalancedBtn.addEventListener('click', () => {
  if (confirm("균형잡힌 이벤트 프리셋을 입력창에 채우시겠습니까? (최종 적용하려면 경품 저장 버튼을 눌러주세요)")) {
    applyPreset(getBalancedPreset(currentPrizes.length));
  }
});

presetGenerousBtn.addEventListener('click', () => {
  if (confirm("꽝이 없는 푸짐한 프리셋을 입력창에 채우시겠습니까? (최종 적용하려면 경품 저장 버튼을 눌러주세요)")) {
    applyPreset(getGenerousPreset(currentPrizes.length));
  }
});

presetBlankBtn.addEventListener('click', () => {
  if (confirm("모든 경품을 '꽝 (아쉬워요!)'으로 비우시겠습니까? (최종 적용하려면 경품 저장 버튼을 눌러주세요)")) {
    applyPreset(Array(currentPrizes.length).fill("꽝 (아쉬워요!)"));
  }
});

// Save all prizes and settings
saveBtn.addEventListener('click', (e) => {
  e.preventDefault();
  
  const updatedPrizes = [];
  let hasEmpty = false;
  const size = currentPrizes.length;
  
  for (let i = 0; i < size; i++) {
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
  for (let i = 0; i < size; i++) {
    const checkbox = document.getElementById(`require-winner-info-${i}`);
    requireWinnerInfo.push(checkbox ? checkbox.checked : false);
  }
  
  SyncHelper.updatePrizesAndSettings(updatedPrizes, requireWinnerInfo);
  alert("🎉 경품 및 설정이 성공적으로 저장 및 live 동기화되었습니다!");
});

// Copy prizes configuration to all accounts (1-5)
const copyToAllBtn = document.getElementById('copy-to-all-btn');
if (copyToAllBtn) {
  copyToAllBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const updatedPrizes = [];
    let hasEmpty = false;
    const cells = document.querySelectorAll('.prize-input-cell');
    const size = (cells && cells.length) ? cells.length : (currentPrizes.length || 25);
    
    for (let i = 0; i < size; i++) {
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
    
    const requireWinnerInfo = [];
    for (let i = 0; i < size; i++) {
      const checkbox = document.getElementById(`require-winner-info-${i}`);
      requireWinnerInfo.push(checkbox ? checkbox.checked : false);
    }
    
    const accName = (SyncHelper.accountNames && SyncHelper.accountNames[accountId]) || `계정 ${accountId}`;
    if (confirm(`현재 계정(${accName})의 경품 내용 및 설정을 계정 1, 2, 3, 4, 5 전체에 동일하게 적용(복사)하시겠습니까?\n\n이 작업은 모든 계정의 경품 배치를 현재 계정과 동일하게 변경하고 풍선판을 초기화합니다.`)) {
      SyncHelper.copyPrizesToAllAccounts(updatedPrizes, requireWinnerInfo, Math.sqrt(size) || 5);
      alert("🎉 모든 계정(1~5)에 현재 경품 설정이 동일하게 성공적으로 적용되었습니다!");
    }
  });
}

// Account Names Settings UI & Saver
function updateAccountNamesUI(names) {
  if (!names) return;
  document.querySelectorAll('.pill-btn').forEach(pill => {
    const acc = pill.getAttribute('data-acc');
    if (names[acc]) {
      pill.innerText = names[acc];
    }
  });
  document.querySelectorAll('.account-card-btn').forEach(btn => {
    const acc = btn.getAttribute('data-account');
    if (names[acc]) {
      const titleSpan = btn.querySelector('.card-title');
      if (titleSpan) titleSpan.innerText = names[acc];
    }
  });
  for (let i = 1; i <= 5; i++) {
    const input = document.getElementById(`acc-name-input-${i}`);
    if (input && names[i] && document.activeElement !== input) {
      input.value = names[i];
    }
  }
}

const saveAccountNamesBtn = document.getElementById('save-account-names-btn');
if (saveAccountNamesBtn) {
  saveAccountNamesBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const newNames = {};
    for (let i = 1; i <= 5; i++) {
      const input = document.getElementById(`acc-name-input-${i}`);
      newNames[i] = input ? input.value.trim() || `계정 ${i}` : `계정 ${i}`;
    }
    SyncHelper.updateAccountNames(newNames);
    alert("🎉 계정 이름이 성공적으로 저장 및 반영되었습니다!");
  });
}

// Reset and Shuffle operations
opResetBtn.addEventListener('click', () => {
  if (confirm("정말 모든 풍선판을 리셋하시겠습니까? (현재 배치된 경품 내용은 그대로 유지됩니다)")) {
    SyncHelper.resetBoard({ shuffle: false });
    alert("풍선판이 정상적으로 초기화되었습니다!");
  }
});

opShuffleBtn.addEventListener('click', () => {
  const size = currentPrizes.length;
  if (confirm(`정말 풍선판 리셋 및 경품 랜덤 셔플을 진행하시겠습니까? (경품들의 위치가 ${size}개 칸에 무작위로 재배치됩니다)`)) {
    SyncHelper.resetBoard({ shuffle: true });
    alert("풍선판이 리셋되고 경품들이 무작위로 뒤섞였습니다!");
  }
});

if (opClearAllBtn) {
  opClearAllBtn.addEventListener('click', () => {
    if (confirm("⚠️ 정말 풍선판의 모든 경품 내용 및 설정을 전체 삭제하시겠습니까?\n\n이 작업은 모든 칸의 경품명과 이미지를 비우고 풍선을 초기화합니다.")) {
      SyncHelper.clearAllBoardContents();
      alert("🗑️ 풍선판의 모든 내용이 전체 삭제되고 초기화되었습니다!");
    }
  });
}

// Master checkbox toggle for requireWinnerInfo
if (toggleAllWinnerInfo) {
  toggleAllWinnerInfo.addEventListener('change', (e) => {
    const checked = e.target.checked;
    const size = currentPrizes.length;
    for (let i = 0; i < size; i++) {
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
      currentRequireWinnerInfo = data.requireWinnerInfo || Array(currentPrizes.length).fill(false);
      buildGridStructure();
      syncUIWithData();
      loadWinnersCount();
      console.log(`Admin SyncHelper successfully loaded data for Account ${accountId}`);
    },
    onStateUpdate: (data) => {
      currentPrizes = data.prizes;
      currentPopped = data.popped;
      currentRequireWinnerInfo = data.requireWinnerInfo || Array(currentPrizes.length).fill(false);
      
      const cellCount = adminPrizeGrid.querySelectorAll('.prize-input-cell').length;
      if (cellCount !== currentPrizes.length) {
        buildGridStructure();
      }
      
      syncUIWithData();
    },
    onNewWinner: (winner) => {
      loadWinnersCount();
    },
    onWinnersCleared: () => {
      winnersCountDiv.innerText = '당첨자: 0명';
    },
    onAccountNamesUpdate: (names) => {
      updateAccountNamesUI(names);
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

  // Grid Size Selection Buttons Listeners
  const btn5 = document.getElementById('grid-size-5x5-btn');
  const btn6 = document.getElementById('grid-size-6x6-btn');

  if (btn5) {
    btn5.addEventListener('click', () => {
      changeGridSize(25);
    });
  }

  if (btn6) {
    btn6.addEventListener('click', () => {
      changeGridSize(36);
    });
  }

  function changeGridSize(targetSize) {
    if (currentPrizes.length === targetSize) return;
    
    if (currentPrizes.length > targetSize) {
      currentPrizes = currentPrizes.slice(0, targetSize);
      currentPopped = currentPopped.slice(0, targetSize);
      currentRequireWinnerInfo = currentRequireWinnerInfo.slice(0, targetSize);
    } else {
      while (currentPrizes.length < targetSize) {
        currentPrizes.push("꽝 (아쉬워요!)");
        currentPopped.push(false);
        currentRequireWinnerInfo.push(false);
      }
    }
    buildGridStructure();
    syncUIWithData();
  }
}
