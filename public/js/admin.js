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
    cell.appendChild(checkboxContainer);
    
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
    
    if (input) {
      input.value = currentPrizes[i] || '';
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
    if (input) {
      input.value = presetArray[i];
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
    const val = document.getElementById(`prize-input-${i}`).value.trim();
    if (!val) {
      hasEmpty = true;
    }
    updatedPrizes.push(val || "꽝");
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

// Download CSV functionality
downloadCsvBtn.addEventListener('click', () => {
  window.location.href = `/api/winners/${accountId}/csv`;
});

// Load winners count on init
function loadWinnersCount() {
  fetch(`/api/winners/${accountId}`)
    .then(res => res.json())
    .then(data => {
      const count = data.winners ? data.winners.length : 0;
      winnersCountDiv.innerText = `당첨자: ${count}명`;
    })
    .catch(err => {
      console.error('Failed to load winners count:', err);
    });
}

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
    }
  });
}
