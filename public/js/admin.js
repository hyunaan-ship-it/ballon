// Real-Time Motion Balloon Popping Game - Admin Script
const socket = io();

// Store live states
let currentPrizes = [];
let currentPopped = [];

const adminPrizeGrid = document.getElementById('admin-prize-grid');
const prizeForm = document.getElementById('prize-form');
const saveBtn = document.getElementById('save-prizes-btn');
const opResetBtn = document.getElementById('op-reset');
const opShuffleBtn = document.getElementById('op-shuffle');

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
    
    cell.appendChild(indexTag);
    cell.appendChild(statusTag);
    cell.appendChild(input);
    
    adminPrizeGrid.appendChild(cell);
  }
}

// Update inputs and badges with server data
function syncUIWithData() {
  for (let i = 0; i < 25; i++) {
    const input = document.getElementById(`prize-input-${i}`);
    const statusTag = document.getElementById(`status-tag-${i}`);
    const cell = document.getElementById(`admin-cell-${i}`);
    
    if (input) {
      input.value = currentPrizes[i] || '';
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
            socket.emit('admin-toggle-pop', i);
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

// Save all prizes
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
  
  socket.emit('admin-update-prizes', updatedPrizes);
  alert("🎉 경품 수정사항이 성공적으로 저장 및 live 동기화되었습니다!");
});

// Reset and Shuffle operations
opResetBtn.addEventListener('click', () => {
  if (confirm("정말 모든 풍선판을 리셋하시겠습니까? (현재 배치된 경품 내용은 그대로 유지됩니다)")) {
    socket.emit('admin-reset-board', { shuffle: false });
    alert("풍선판이 정상적으로 초기화되었습니다!");
  }
});

opShuffleBtn.addEventListener('click', () => {
  if (confirm("정말 풍선판 리셋 및 경품 랜덤 셔플을 진행하시겠습니까? (경품들의 위치가 25개 칸에 무작위로 재배치됩니다)")) {
    socket.emit('admin-reset-board', { shuffle: true });
    alert("풍선판이 리셋되고 경품들이 무작위로 뒤섞였습니다!");
  }
});

// Socket Event Receivers
socket.on('connect', () => {
  console.log("Admin socket connected");
});

socket.on('init-state', (data) => {
  currentPrizes = data.prizes;
  currentPopped = data.popped;
  buildGridStructure();
  syncUIWithData();
});

socket.on('state-updated', (data) => {
  currentPrizes = data.prizes;
  currentPopped = data.popped;
  syncUIWithData();
});
