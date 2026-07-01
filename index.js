const API_URLS = {
    lotto: "https://script.google.com/macros/s/AKfycbxFjCoZUcfTYRmPiWjJL3Q4_5S5Dzq8TNRPI0_73VYrRJ1QuoHryi6I4qOE-7wxbH--/exec",
    pension: "https://script.google.com/macros/s/AKfycbzzQNFIXSo7WkRpVAPkR1M-8PbpZYokVBFPlChXfK3IgCxyI2dpxj8R6cI_k5b6gXLS/exec"
};

const LOTTO_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRlGZv0VLyDVm6SviCjdd08hZpXWXHiPzcgXAurWBqGjsOOq1CPoRr1LRBzlnR80KDVa_ECBl96pAxJ/pub?output=csv";
const PENSION_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRd4x0RXfEIeLkukYyrO3sU7qL4MX36JeSdfPXJjCO-Kt8bSgC6P341NC81DBTd3Yi8BS82VBvCBhte/pub?gid=0&single=true&output=csv";

const STORAGE_KEYS = {
    theme: 'quantum_theme_v252',
    settings: 'quantum_generator_settings_v252',
    lottoStore: 'v13_db',
    pensionStore: 'v13_pension_db'
};

const DEFAULT_GENERATOR_SETTINGS = {
    lotto: {
        carryMin: 0,
        carryMax: 2,
        adjacentMin: 0,
        adjacentMax: 2,
        uniqueOnly: true,
        smartSort: true
    },
    pension: {
        uniqueOnly: true,
        smartSort: true
    }
};

let currentMode = 'lotto';
let DB = { lotto: [], pension: [] };
let coreDB = { lotto: [], pension: [] };
let fixes = new Set();
let excs = new Set();
let currentStatsRange = 10;
let pageStatus = { win: 20, history: 20, store: 20 };
let generatorSettings = loadGeneratorSettings();
window.sessionData = [];

window.onload = async () => {
    log('🛰️ 퀀텀 데이터베이스 접속 중...');
    populateQuantitySelect();
    populateAdvancedSelects();
    bindInputEvents();
    restoreTheme();

    await syncData('lotto', LOTTO_CSV_URL);
    await syncData('pension', PENSION_CSV_URL);

    updateDDay();
    setInterval(updateDDay, 1000);
    refreshUI();
};

function loadGeneratorSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.settings);
        if (!raw) return structuredClone(DEFAULT_GENERATOR_SETTINGS);
        const saved = JSON.parse(raw);
        return {
            lotto: { ...DEFAULT_GENERATOR_SETTINGS.lotto, ...(saved.lotto || {}) },
            pension: { ...DEFAULT_GENERATOR_SETTINGS.pension, ...(saved.pension || {}) }
        };
    } catch (_) {
        return structuredClone(DEFAULT_GENERATOR_SETTINGS);
    }
}

function persistGeneratorSettings() {
    try {
        localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(generatorSettings));
    } catch (_) {}
}

function structuredClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function restoreTheme() {
    try {
        const theme = localStorage.getItem(STORAGE_KEYS.theme);
        if (theme) document.body.setAttribute('data-theme', theme);
    } catch (_) {}
}

function saveTheme(theme) {
    try {
        localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch (_) {}
}

function scrollToGenerator() {
    const target = document.getElementById('gen-panel');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function populateQuantitySelect() {
    const qtySelect = document.getElementById('gen-qty');
    if (!qtySelect) return;
    qtySelect.innerHTML = '';
    for (let i = 1; i <= 100; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.innerText = `${i} 게임`;
        qtySelect.appendChild(opt);
    }
    qtySelect.value = 5;
}

function populateAdvancedSelects() {
    const selectIds = ['carry-min-select', 'carry-max-select', 'adjacent-min-select', 'adjacent-max-select'];
    selectIds.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '';
        for (let i = 0; i <= 3; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.innerText = `${i}개`;
            select.appendChild(opt);
        }
    });
}

function bindInputEvents() {
    const bindEnter = (id, type) => {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addFilter(type);
            }
        });
    };
    bindEnter('fix-in', 'fix');
    bindEnter('exc-in', 'exc');
}

function updateGeneratorOption(key, value) {
    const settings = generatorSettings[currentMode];
    settings[key] = typeof value === 'boolean' ? value : parseInt(value, 10);

    if (currentMode === 'lotto') {
        if (settings.carryMin > settings.carryMax) settings.carryMax = settings.carryMin;
        if (settings.adjacentMin > settings.adjacentMax) settings.adjacentMax = settings.adjacentMin;
    }

    persistGeneratorSettings();
    renderAdvancedSettingsUI();
}

function applyRecommendedLottoPreset() {
    if (currentMode === 'lotto') {
        generatorSettings.lotto = {
            ...generatorSettings.lotto,
            carryMin: 0,
            carryMax: 2,
            adjacentMin: 0,
            adjacentMax: 2,
            uniqueOnly: true,
            smartSort: true
        };
    } else {
        generatorSettings.pension = {
            ...generatorSettings.pension,
            uniqueOnly: true,
            smartSort: true
        };
    }
    persistGeneratorSettings();
    renderAdvancedSettingsUI();
    log(`⚙️ [${currentMode === 'lotto' ? '로또' : '연금'}] 추천 프리셋을 적용했습니다.`);
}

function resetAdvancedFilters() {
    generatorSettings[currentMode] = structuredClone(DEFAULT_GENERATOR_SETTINGS[currentMode]);
    persistGeneratorSettings();
    renderAdvancedSettingsUI();
    log(`♻️ [${currentMode === 'lotto' ? '로또' : '연금'}] 고급 필터를 초기화했습니다.`);
}

function renderAdvancedSettingsUI() {
    const settings = generatorSettings[currentMode];
    const isLotto = currentMode === 'lotto';

    const carryMin = document.getElementById('carry-min-select');
    const carryMax = document.getElementById('carry-max-select');
    const adjacentMin = document.getElementById('adjacent-min-select');
    const adjacentMax = document.getElementById('adjacent-max-select');
    const uniqueOnly = document.getElementById('unique-only-toggle');
    const smartSort = document.getElementById('smart-sort-toggle');
    const help = document.getElementById('advanced-help-text');
    const guide = document.getElementById('guide-text');
    const fixInput = document.getElementById('fix-in');
    const excInput = document.getElementById('exc-in');

    if (carryMin) carryMin.value = generatorSettings.lotto.carryMin;
    if (carryMax) carryMax.value = generatorSettings.lotto.carryMax;
    if (adjacentMin) adjacentMin.value = generatorSettings.lotto.adjacentMin;
    if (adjacentMax) adjacentMax.value = generatorSettings.lotto.adjacentMax;
    if (uniqueOnly) uniqueOnly.checked = !!settings.uniqueOnly;
    if (smartSort) smartSort.checked = !!settings.smartSort;

    document.querySelectorAll('.lotto-only').forEach(el => {
        el.style.display = isLotto ? '' : 'none';
    });

    if (help) {
        help.innerText = isLotto
            ? `직전 회차 기준 이월수 ${generatorSettings.lotto.carryMin}~${generatorSettings.lotto.carryMax}개, 인접수 ${generatorSettings.lotto.adjacentMin}~${generatorSettings.lotto.adjacentMax}개로 제한합니다.`
            : '연금 모드에서는 중복 방지와 점수순 정렬 설정을 유지합니다.';
    }

    if (guide) {
        guide.innerHTML = isLotto
            ? `강조된 번호는 전회차 당첨번호인 <b>'이월수'</b> 입니다. 현재 설정: 이월수 ${generatorSettings.lotto.carryMin}~${generatorSettings.lotto.carryMax}개 / 인접수 ${generatorSettings.lotto.adjacentMin}~${generatorSettings.lotto.adjacentMax}개`
            : `연금 모드에서는 자리별 밸런스 중심으로 생성합니다. <b>중복 조합 방지</b>와 <b>점수순 정렬</b>이 적용됩니다.`;
    }

    if (fixInput) fixInput.placeholder = isLotto ? '고정수 (1~45, 콤마구분)' : '고정 숫자 (0~9, 콤마구분)';
    if (excInput) excInput.placeholder = isLotto ? '제외수 (1~45, 콤마구분)' : '제외 숫자 (0~9, 콤마구분)';
}

function log(msg) {
    const terminal = document.getElementById('term');
    if (!terminal) return;
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerText = `> ${msg}`;
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

async function syncData(mode, url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        const rows = text.split(/\r?\n/).filter(r => r.trim() !== '').slice(1);
        const parsed = rows.map(row => {
            const cells = row
                .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
                .map(v => v.replace(/^"|"$/g, '').trim());

            if (mode === 'lotto') {
                return {
                    r: parseInt(cells[0], 10),
                    date: cells[1],
                    n: [2, 3, 4, 5, 6, 7].map(idx => parseInt(cells[idx], 10)),
                    b: parseInt(cells[8], 10),
                    r1m: cells[10],
                    r2m: cells[12]
                };
            }

            return {
                r: parseInt(cells[0], 10),
                date: cells[1],
                group: cells[2],
                n: [3, 4, 5, 6, 7, 8].map(idx => parseInt(cells[idx], 10))
            };
        }).filter(item => !Number.isNaN(item.r));

        DB[mode] = parsed.sort((a, b) => b.r - a.r);
        coreDB[mode] = DB[mode].slice(0, 10);
        log(`✅ ${mode.toUpperCase()} 데이터 동기화 완료.`);
    } catch (e) {
        console.error(e);
        log(`⚠️ ${mode.toUpperCase()} 데이터 동기화 실패.`);
    }
}

function updateDDay() {
    const now = new Date();
    const isLotto = currentMode === 'lotto';
    const targetDay = isLotto ? 6 : 4;
    const targetHour = isLotto ? 20 : 19;
    const targetMinute = isLotto ? 35 : 5;

    let targetDate = new Date();
    targetDate.setDate(now.getDate() + (targetDay + 7 - now.getDay()) % 7);
    targetDate.setHours(targetHour, targetMinute, 0, 0);
    if (now > targetDate) targetDate.setDate(targetDate.getDate() + 7);

    const diff = targetDate - now;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);

    const ticker = document.getElementById('dday-display');
    if (ticker) ticker.innerText = `${isLotto ? '로또' : '연금'} 추첨까지: ${d}일 ${h}시간 ${m}분 ${s}초`;
}

function toggleTheme() {
    const current = document.body.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    saveTheme(next);
    log(`🌓 [${next.toUpperCase()}] 모드로 전환`);
}

function getStorageKey(mode = currentMode) {
    return mode === 'lotto' ? STORAGE_KEYS.lottoStore : STORAGE_KEYS.pensionStore;
}

function getLottoCarryNumbers() {
    return DB.lotto[0]?.n ? [...DB.lotto[0].n] : [];
}

function getLottoAdjacentNumbers() {
    const carrySet = new Set(getLottoCarryNumbers());
    const adjacent = new Set();
    for (const num of carrySet) {
        if (num - 1 >= 1 && !carrySet.has(num - 1)) adjacent.add(num - 1);
        if (num + 1 <= 45 && !carrySet.has(num + 1)) adjacent.add(num + 1);
    }
    return [...adjacent].sort((a, b) => a - b);
}

function countMatches(nums, source) {
    const sourceSet = new Set(source);
    return nums.filter(n => sourceSet.has(n)).length;
}

function getCombinationKey(data) {
    return `${currentMode}:${data.group || ''}:${data.n.join('-')}`;
}

function shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function getLottoScore(metrics) {
    const [odd, even] = metrics.m1.split(':').map(Number);
    const [low, high] = metrics.m2.split(':').map(Number);
    const sectionArr = metrics.m10.split('-').map(Number);
    const maxZone = Math.max(...sectionArr);
    let score = 58;

    if (odd >= 2 && odd <= 4) score += 8;
    if (odd === 3) score += 4;

    if (low >= 2 && low <= 4) score += 8;
    if (low === 3) score += 4;

    if (metrics.m5 >= 100 && metrics.m5 <= 170) score += 10;
    if (metrics.m5 >= 115 && metrics.m5 <= 155) score += 5;

    if (metrics.m3 >= 7) score += 8;
    if (metrics.m3 >= 9) score += 4;

    if (metrics.m8 <= 2) score += 5;
    if (metrics.m8 <= 1) score += 2;

    if (metrics.m11 >= 1 && metrics.m11 <= 4) score += 4;
    if (metrics.m11 >= 2 && metrics.m11 <= 3) score += 2;

    if (metrics.m9 <= 2) score += 3;
    if (maxZone <= 3) score += 5;
    if (maxZone <= 2) score += 2;

    return Math.min(99, score);
}

function getPensionScore(metrics) {
    const odd = parseInt((metrics.p4.match(/홀(\d+)/) || [])[1] || '0', 10);
    const low = parseInt((metrics.p3.match(/저(\d+)/) || [])[1] || '0', 10);
    const uniqueDigits = metrics.p9;
    let score = 60;

    if (metrics.p2 >= 16 && metrics.p2 <= 30) score += 11;
    if (odd >= 2 && odd <= 4) score += 7;
    if (low >= 2 && low <= 4) score += 7;
    if (metrics.p5Num <= 1) score += 6;
    if (uniqueDigits >= 4) score += 5;
    if (metrics.p8Num >= 1 && metrics.p8Num <= 3) score += 4;

    return Math.min(99, score);
}

function getMetrics(numbers, mode = currentMode) {
    if (mode === 'lotto') {
        const sorted = [...numbers].sort((a, b) => a - b);
        const odd = numbers.filter(n => n % 2 !== 0).length;
        const low = numbers.filter(n => n <= 22).length;
        const sum = numbers.reduce((acc, cur) => acc + cur, 0);
        const endDigits = numbers.map(n => n % 10);
        const diffSet = new Set();
        for (let i = 0; i < sorted.length; i++) {
            for (let j = i + 1; j < sorted.length; j++) {
                diffSet.add(Math.abs(sorted[j] - sorted[i]));
            }
        }
        const ac = diffSet.size - 5;
        let serial = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i + 1] - sorted[i] === 1) serial++;
        }
        const zones = [0, 0, 0, 0, 0];
        sorted.forEach(n => {
            if (n <= 9) zones[0]++;
            else if (n <= 18) zones[1]++;
            else if (n <= 27) zones[2]++;
            else if (n <= 36) zones[3]++;
            else zones[4]++;
        });
        const primes = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43]);
        const carryCount = countMatches(numbers, getLottoCarryNumbers());
        const adjacentCount = countMatches(numbers, getLottoAdjacentNumbers());

        const metrics = {
            m1: `${odd}:${6 - odd}`,
            m2: `${low}:${6 - low}`,
            m3: ac,
            m4: endDigits.reduce((acc, cur) => acc + cur, 0),
            m5: sum,
            m6: sorted[5] - sorted[0],
            m7: (sum / 6).toFixed(1),
            m8: serial,
            m9: 6 - new Set(endDigits).size,
            m10: zones.join('-'),
            m11: numbers.filter(n => primes.has(n)).length,
            m12: carryCount,
            m13: adjacentCount
        };

        const score = getLottoScore(metrics);
        const grade = score >= 92 ? 'LEGEND' : (score >= 84 ? 'STRONG' : 'NORMAL');
        return { ...metrics, score, grade };
    }

    const sum = numbers.reduce((acc, cur) => acc + cur, 0);
    const odd = numbers.filter(n => n % 2 !== 0).length;
    const low = numbers.filter(n => n <= 4).length;
    let serial = 0;
    for (let i = 0; i < numbers.length - 1; i++) {
        if (Math.abs(numbers[i + 1] - numbers[i]) === 1) serial++;
    }
    const primeDigits = new Set([2, 3, 5, 7]);
    const primeCount = numbers.filter(n => primeDigits.has(n)).length;
    const uniqueDigits = new Set(numbers).size;

    const metrics = {
        p1: 'PASS',
        p2: sum,
        p3: `저${low}:고${6 - low}`,
        p4: `홀${odd}:짝${6 - odd}`,
        p5: `${serial}-Step`,
        p5Num: serial,
        p6: numbers[3] + numbers[4] + numbers[5],
        p7: (sum / 6).toFixed(1),
        p8: `${primeCount}개`,
        p8Num: primeCount,
        p9: uniqueDigits
    };

    const score = getPensionScore(metrics);
    const grade = score >= 92 ? 'LEGEND' : (score >= 84 ? 'STRONG' : 'NORMAL');
    return { ...metrics, score, grade };
}

function isValidFilterNumber(value) {
    if (Number.isNaN(value)) return false;
    return currentMode === 'lotto' ? value >= 1 && value <= 45 : value >= 0 && value <= 9;
}

function addFilter(type) {
    const input = document.getElementById(`${type}-in`);
    if (!input) return;

    const values = input.value.split(',').map(v => parseInt(v.trim(), 10)).filter(isValidFilterNumber);
    if (!values.length) {
        input.value = '';
        return;
    }

    values.forEach(value => {
        if (type === 'fix') {
            if (excs.has(value)) {
                log(`⚠️ ${value}번은 제외수에 있어 고정수로 추가하지 않았습니다.`);
                return;
            }
            if (currentMode === 'lotto' && fixes.size >= 5 && !fixes.has(value)) {
                log('⚠️ 로또 고정수는 최대 5개까지 설정 가능합니다.');
                return;
            }
            if (currentMode === 'pension' && fixes.size >= 6 && !fixes.has(value)) {
                log('⚠️ 연금 고정 숫자는 최대 6개까지 설정 가능합니다.');
                return;
            }
            fixes.add(value);
        } else {
            if (fixes.has(value)) {
                log(`⚠️ ${value}번은 고정수에 있어 제외수로 추가하지 않았습니다.`);
                return;
            }
            excs.add(value);
        }
    });

    input.value = '';
    renderChips();
}

function renderChips() {
    const fixWrap = document.getElementById('fix-chips');
    const excWrap = document.getElementById('exc-chips');
    if (!fixWrap || !excWrap) return;

    fixWrap.innerHTML = [...fixes].sort((a, b) => a - b).map(n => `
        <span class="chip chip-fix">${n} <span onclick="removeChip('fix', ${n})" style="cursor:pointer">×</span></span>
    `).join('');

    excWrap.innerHTML = [...excs].sort((a, b) => a - b).map(n => `
        <span class="chip chip-exc">${n} <span onclick="removeChip('exc', ${n})" style="cursor:pointer">×</span></span>
    `).join('');
}

function removeChip(type, value) {
    if (type === 'fix') fixes.delete(value);
    else excs.delete(value);
    renderChips();
}

function formatNums(nums) {
    return nums.map(n => n.toString().padStart(currentMode === 'lotto' ? 2 : 1, '0')).join(' ');
}

function getLottoCol(num) {
    if (num <= 10) return 'l1';
    if (num <= 20) return 'l2';
    if (num <= 30) return 'l3';
    if (num <= 40) return 'l4';
    return 'l5';
}

function createLottoCandidate() {
    const numbers = [...fixes];
    const pool = [];
    for (let n = 1; n <= 45; n++) {
        if (!numbers.includes(n) && !excs.has(n)) pool.push(n);
    }
    const shuffled = shuffle(pool);
    while (numbers.length < 6 && shuffled.length) numbers.push(shuffled.pop());
    return numbers.sort((a, b) => a - b);
}

function createPensionCandidate() {
    const fixedDigits = [...fixes];
    const numbers = [...fixedDigits];
    const allowedDigits = Array.from({ length: 10 }, (_, i) => i).filter(n => !excs.has(n));
    while (numbers.length < 6) {
        const randomDigit = allowedDigits[Math.floor(Math.random() * allowedDigits.length)];
        numbers.push(randomDigit);
    }
    return numbers.slice(0, 6);
}

function passesConstraints(candidate) {
    if (currentMode !== 'lotto') return true;

    const settings = generatorSettings.lotto;
    const carryCount = countMatches(candidate, getLottoCarryNumbers());
    const adjacentCount = countMatches(candidate, getLottoAdjacentNumbers());

    return carryCount >= settings.carryMin
        && carryCount <= settings.carryMax
        && adjacentCount >= settings.adjacentMin
        && adjacentCount <= settings.adjacentMax;
}

function canGenerateCurrentMode() {
    if (currentMode === 'lotto') {
        const available = Array.from({ length: 45 }, (_, i) => i + 1).filter(n => !excs.has(n));
        if (available.length < 6 || fixes.size > 5) {
            log('⚠️ 현재 로또 필터로는 6개 조합을 만들 수 없습니다.');
            return false;
        }
        return true;
    }

    const availableDigits = Array.from({ length: 10 }, (_, i) => i).filter(n => !excs.has(n));
    if (!availableDigits.length && fixes.size < 6) {
        log('⚠️ 연금 숫자를 모두 제외해서 더 이상 생성할 수 없습니다.');
        return false;
    }
    if (fixes.size > 6) {
        log('⚠️ 연금 고정 숫자가 6개를 초과했습니다.');
        return false;
    }
    return true;
}

function gradeWeight(grade) {
    return grade === 'LEGEND' ? 3 : grade === 'STRONG' ? 2 : 1;
}

function sortGeneratedData(dataList) {
    if (!generatorSettings[currentMode].smartSort) return dataList;
    return [...dataList].sort((a, b) => {
        const weightDiff = gradeWeight(b.grade) - gradeWeight(a.grade);
        if (weightDiff !== 0) return weightDiff;
        if (b.score !== a.score) return b.score - a.score;
        const aSum = currentMode === 'lotto' ? a.m5 : a.p2;
        const bSum = currentMode === 'lotto' ? b.m5 : b.p2;
        return Math.abs(132 - aSum) - Math.abs(132 - bSum);
    });
}

function buildCandidateData() {
    const latestRound = DB[currentMode][0] ? parseInt(DB[currentMode][0].r, 10) + 1 : 0;
    const numbers = currentMode === 'lotto' ? createLottoCandidate() : createPensionCandidate();
    const metrics = getMetrics(numbers, currentMode);
    return {
        n: numbers,
        ...metrics,
        targetRound: latestRound,
        carryList: currentMode === 'lotto' ? getLottoCarryNumbers() : [],
        group: currentMode === 'pension' ? `${Math.floor(Math.random() * 5) + 1}조` : null
    };
}

function renderGenerationSummary(dataList, attempts, targetGrade) {
    const box = document.getElementById('gen-summary');
    if (!box) return;

    if (!dataList.length) {
        box.classList.add('hidden');
        box.innerHTML = '';
        return;
    }

    const gradeCounts = dataList.reduce((acc, cur) => {
        acc[cur.grade] = (acc[cur.grade] || 0) + 1;
        return acc;
    }, { LEGEND: 0, STRONG: 0, NORMAL: 0 });

    const avgScore = (dataList.reduce((acc, cur) => acc + cur.score, 0) / dataList.length).toFixed(1);
    const pills = [
        `<span class="summary-pill"><strong>생성</strong> ${dataList.length}건</span>`,
        `<span class="summary-pill"><strong>연산</strong> ${attempts.toLocaleString()}회</span>`,
        `<span class="summary-pill"><strong>평균 점수</strong> ${avgScore}%</span>`,
        `<span class="summary-pill"><strong>Legend</strong> ${gradeCounts.LEGEND}</span>`,
        `<span class="summary-pill"><strong>Strong</strong> ${gradeCounts.STRONG}</span>`,
        `<span class="summary-pill"><strong>Normal</strong> ${gradeCounts.NORMAL}</span>`
    ];

    if (currentMode === 'lotto') {
        const avgCarry = (dataList.reduce((acc, cur) => acc + (cur.m12 || 0), 0) / dataList.length).toFixed(1);
        const avgAdjacent = (dataList.reduce((acc, cur) => acc + (cur.m13 || 0), 0) / dataList.length).toFixed(1);
        pills.push(`<span class="summary-pill"><strong>평균 이월수</strong> ${avgCarry}개</span>`);
        pills.push(`<span class="summary-pill"><strong>평균 인접수</strong> ${avgAdjacent}개</span>`);
    }

    box.classList.remove('hidden');
    box.innerHTML = `
        <div class="summary-title">${targetGrade ? `${targetGrade} 등급 목표 생성 완료` : '스마트 생성 완료'}</div>
        <div class="summary-pill-wrap">${pills.join('')}</div>
    `;
}

async function generateBatch(targetGrade = null) {
    const requested = parseInt(document.getElementById('gen-qty').value, 10) || 1;
    const list = document.getElementById('res-list');
    list.innerHTML = '';
    window.sessionData = [];

    if (!canGenerateCurrentMode()) {
        updateBatchCopyBtn('gen');
        renderGenerationSummary([], 0, targetGrade);
        return;
    }

    const result = [];
    const seen = new Set();
    let attempts = 0;
    const maxAttempts = Math.max(15000, requested * (targetGrade ? 4500 : 1800));

    log(targetGrade
        ? `🎯 [${targetGrade}] 등급 필터 생성 시작...`
        : `🎲 [${currentMode.toUpperCase()}] 스마트 생성 시작...`
    );

    while (result.length < requested && attempts < maxAttempts) {
        attempts++;
        const data = buildCandidateData();
        if (!passesConstraints(data.n)) continue;
        if (targetGrade && data.grade !== targetGrade) continue;

        const key = getCombinationKey(data);
        if (generatorSettings[currentMode].uniqueOnly && seen.has(key)) continue;
        seen.add(key);
        result.push(data);
    }

    const sorted = sortGeneratedData(result);
    window.sessionData = sorted;
    sorted.forEach(item => renderCard(list, item, false));
    updateBatchCopyBtn('gen');
    renderGenerationSummary(sorted, attempts, targetGrade);

    if (!sorted.length) {
        log('⚠️ 조건이 너무 빡빡해서 결과를 만들지 못했습니다.');
        return;
    }

    if (sorted.length < requested) {
        log(`⚠️ 요청 ${requested}건 중 ${sorted.length}건만 생성했습니다. 필터를 조금 완화해 보세요.`);
    } else {
        log(`✅ ${sorted.length}건 생성 완료.`);
    }

    const latestRound = DB[currentMode][0] ? parseInt(DB[currentMode][0].r, 10) + 1 : 0;
    await pushToGlobalBatch(sorted.map(item => ({
        round: latestRound,
        mode: currentMode,
        numbers: item.n,
        group: item.group,
        grade: item.grade
    })));
}

async function triggerGen() {
    await generateBatch(null);
}

async function triggerGradeGen(targetGrade) {
    await generateBatch(targetGrade);
}

function clearList() {
    document.getElementById('res-list').innerHTML = '';
    window.sessionData = [];
    updateBatchCopyBtn('gen');
    renderGenerationSummary([], 0, null);
    log('🧹 생성 목록을 초기화했습니다.');
}

function copyToClipboard(nums, group) {
    const text = `${group ? `${group} ` : ''}${formatNums(nums)}`;
    navigator.clipboard.writeText(text);
    alert('복사 완료');
}

function copyBatch(type) {
    const storeKey = getStorageKey();
    const data = type === 'gen' ? window.sessionData : JSON.parse(localStorage.getItem(storeKey) || '[]');
    if (!data.length) return;
    const text = data.map(item => `${item.group ? `${item.group} ` : ''}${formatNums(item.n)}`).join('\n');
    navigator.clipboard.writeText(text);
    alert('📋 복사 완료');
}

function updateBatchCopyBtn(type) {
    const storeKey = getStorageKey();
    const data = type === 'gen' ? window.sessionData : JSON.parse(localStorage.getItem(storeKey) || '[]');
    const copyBtn = document.getElementById(`batch-copy-${type}`);
    const slipBtn = document.getElementById(`batch-slip-${type}`);

    if (copyBtn) {
        copyBtn.innerText = `📋 전체 조합 복사 (${data.length}건)`;
        copyBtn.classList.toggle('hidden', !data.length);
    }
    if (slipBtn) slipBtn.classList.toggle('hidden', !data.length);
}

async function pushToGlobalBatch(dataList) {
    if (!dataList || !dataList.length) return;
    const targetUrl = API_URLS[currentMode];
    try {
        await fetch(targetUrl, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(dataList)
        });
        log(`🌐 [CLOUD] ${dataList.length}건 동기화 완료.`);
    } catch (e) {
        console.error(e);
    }
}

function switchMode(mode) {
    currentMode = mode;
    pageStatus = { win: 20, history: 20, store: 20 };
    fixes.clear();
    excs.clear();
    renderChips();
    clearList();

    document.getElementById('mode-lotto').classList.toggle('active', mode === 'lotto');
    document.getElementById('mode-pension').classList.toggle('active', mode === 'pension');
    document.getElementById('gen-qty').value = mode === 'lotto' ? 5 : 3;

    renderAdvancedSettingsUI();
    refreshUI();
    log(`🔄 [${mode === 'lotto' ? '로또 6/45' : '연금 720+'}] 모드로 전환`);
}

function refreshUI() {
    const latest = DB[currentMode][0];
    if (!latest) return;

    const targetRound = document.getElementById('target-round');
    if (targetRound) targetRound.innerText = `${latest.r + 1}회`;

    updateInfoSection();
    updateRecentWin(latest);
    updateStats();
    renderAdvancedSettingsUI();
    renderHeatmap();
    renderAdvancedInsights();
    renderH();
    updateBatchCopyBtn('store');
}

function updateInfoSection() {
    const title = document.getElementById('info-title');
    const content = document.getElementById('info-content');
    if (!title || !content) return;

    if (currentMode === 'lotto') {
        title.innerHTML = '🎰 LOTTO 6/45 당첨 및 수령 안내';
        content.innerHTML = `
            <table class="info-table">
                <tr><td>1등</td><td>당첨번호 <span class="info-emphasis">6개</span> 숫자 일치</td></tr>
                <tr><td>2등</td><td>당첨번호 <span class="info-emphasis">5개 + 보너스</span> 일치</td></tr>
                <tr><td>3등</td><td>당첨번호 <span class="info-emphasis">5개</span> 숫자 일치</td></tr>
                <tr><td>4등</td><td>당첨번호 <span class="info-emphasis">4개</span> 숫자 일치</td></tr>
                <tr><td>5등</td><td>당첨번호 <span class="info-emphasis">3개</span> 숫자 일치</td></tr>
                <tr><td>추첨일시</td><td>매주 <span class="info-emphasis">토요일</span> 오후 8시 35분경 (MBC)</td></tr>
                <tr><td>지급기한</td><td>지급개시일로부터 <span class="info-emphasis">1년</span> (휴일 익영업일)</td></tr>
            </table>
        `;
    } else {
        title.innerHTML = '🎫 PENSION 720+ 당첨 및 수령 안내';
        content.innerHTML = `
            <table class="info-table">
                <tr><td>1등</td><td>조 + <span class="info-emphasis">6자리</span> 일치</td></tr>
                <tr><td>2등</td><td>조 불일치 + <span class="info-emphasis">6자리</span> 일치</td></tr>
                <tr><td>3~7등</td><td>각 등수별 뒤자리 조건 충족</td></tr>
                <tr><td>추첨일시</td><td>매주 <span class="info-emphasis">목요일</span> 오후 7시 05분경 (MBC)</td></tr>
                <tr><td>지급기한</td><td>지급개시일로부터 <span class="info-emphasis">1년</span> (휴일 익영업일)</td></tr>
            </table>
        `;
    }
}

function updateRecentWin(latest) {
    const roundLabel = document.getElementById('recent-round-label');
    const dateLabel = document.getElementById('recent-date-label');
    const row = document.getElementById('recent-balls-row');
    const heroRound = document.getElementById('hero-round');
    if (!roundLabel || !dateLabel || !row) return;

    roundLabel.innerText = `제 ${latest.r}회 당첨 결과`;
    dateLabel.innerText = latest.date;
    if (heroRound) heroRound.innerText = `제 ${Number(latest.r) + 1}회 참고`;

    if (currentMode === 'lotto') {
        row.innerHTML = latest.n.map(num => `<div class="ball-s ${getLottoCol(num)}">${num}</div>`).join('')
            + `<span style="align-self:center; font-weight:900; margin:0 5px;">+</span>`
            + `<div class="ball-s ${getLottoCol(latest.b)}">${latest.b}</div>`;
    } else {
        row.innerHTML = `<div class="group-tag">${latest.group}</div>`
            + latest.n.map((num, idx) => `<div class="ball-s b${idx + 1}">${num}</div>`).join('');
    }
}

function updateStats() {
    const recent = coreDB[currentMode];
    if (!recent.length) return;

    const hot = document.getElementById('hot-v');
    const cold = document.getElementById('cold-v');
    if (!hot || !cold) return;

    if (currentMode === 'lotto') {
        const counts = {};
        recent.forEach(round => round.n.forEach(num => counts[num] = (counts[num] || 0) + 1));
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        hot.innerText = sorted[0] ? `${sorted[0][0]}번` : '--';
        const unappeared = Array.from({ length: 45 }, (_, i) => i + 1).filter(n => !recent.some(round => round.n.includes(n)));
        cold.innerText = unappeared[0] ? `${unappeared[0]}번` : '--';
    } else {
        const hotDigits = [];
        const coldDigits = [];
        for (let idx = 0; idx < 6; idx++) {
            const posCounts = {};
            const digits = recent.map(round => round.n[idx]);
            digits.forEach(n => posCounts[n] = (posCounts[n] || 0) + 1);
            const sorted = Object.entries(posCounts).sort((a, b) => b[1] - a[1]);
            hotDigits.push(sorted[0] ? sorted[0][0] : '?');
            const missing = Array.from({ length: 10 }, (_, i) => i).find(n => !digits.includes(n));
            coldDigits.push(missing ?? '?');
        }
        hot.innerText = hotDigits.join(' ');
        cold.innerText = coldDigits.join(' ');
    }
}

function renderCard(target, data, isHistoryCard) {
    const uid = `card-${Math.random().toString(36).slice(2, 11)}`;
    const card = document.createElement('div');
    card.id = uid;
    card.className = isHistoryCard ? 'history-card collapsed' : 'res-card collapsed';
    card.onclick = (e) => {
        if (!e.target.closest('button')) card.classList.toggle('collapsed');
    };

    const grade = data.grade || getMetrics(data.n, currentMode).grade;
    const score = data.score || getMetrics(data.n, currentMode).score;

    const balls = data.n.map((n, idx) => {
        const ballClass = currentMode === 'lotto' ? getLottoCol(n) : `b${idx + 1}`;
        const carryClass = (data.carryList || []).includes(n) ? 'carry' : '';
        return `<div class="ball ${ballClass} ${carryClass}">${n}</div>`;
    }).join('');

    const metricsHtml = currentMode === 'lotto'
        ? `
            <div class="mt-box"><span class="mt-label">홀짝</span><span class="mt-val">${data.m1}</span></div>
            <div class="mt-box"><span class="mt-label">저고</span><span class="mt-val">${data.m2}</span></div>
            <div class="mt-box"><span class="mt-label">AC값</span><span class="mt-val highlight">${data.m3}</span></div>
            <div class="mt-box"><span class="mt-label">끝수합</span><span class="mt-val">${data.m4}</span></div>
            <div class="mt-box"><span class="mt-label">총합</span><span class="mt-val highlight">${data.m5}</span></div>
            <div class="mt-box"><span class="mt-label">범위</span><span class="mt-val">${data.m6}</span></div>
            <div class="mt-box"><span class="mt-label">평균</span><span class="mt-val">${data.m7}</span></div>
            <div class="mt-box"><span class="mt-label">연속</span><span class="mt-val highlight">${data.m8}</span></div>
            <div class="mt-box"><span class="mt-label">끝중복</span><span class="mt-val">${data.m9}</span></div>
            <div class="mt-box"><span class="mt-label">구간분포</span><span class="mt-val">${data.m10}</span></div>
            <div class="mt-box"><span class="mt-label">소수</span><span class="mt-val highlight">${data.m11}</span></div>
            <div class="mt-box"><span class="mt-label">이월수</span><span class="mt-val highlight">${data.m12 ?? 0}</span></div>
            <div class="mt-box"><span class="mt-label">인접수</span><span class="mt-val">${data.m13 ?? 0}</span></div>
        `
        : `
            <div class="mt-box"><span class="mt-label">자리 매칭</span><span class="mt-val highlight">${data.p1}</span></div>
            <div class="mt-box"><span class="mt-label">디지트 합</span><span class="mt-val highlight">${data.p2}</span></div>
            <div class="mt-box"><span class="mt-label">저고 비율</span><span class="mt-val">${data.p3}</span></div>
            <div class="mt-box"><span class="mt-label">홀짝 비율</span><span class="mt-val">${data.p4}</span></div>
            <div class="mt-box"><span class="mt-label">연속 패턴</span><span class="mt-val highlight">${data.p5}</span></div>
            <div class="mt-box"><span class="mt-label">끝3자 합</span><span class="mt-val">${data.p6}</span></div>
            <div class="mt-box"><span class="mt-label">평균값</span><span class="mt-val">${data.p7}</span></div>
            <div class="mt-box"><span class="mt-label">소수포함</span><span class="mt-val highlight">${data.p8}</span></div>
            <div class="mt-box"><span class="mt-label">중복없는 수</span><span class="mt-val">${data.p9}</span></div>
        `;

    card.innerHTML = `
        <div class="badge">
            <span class="badge-unit badge-${grade.toLowerCase()}">${grade} ${score}%</span>
        </div>
        ${isHistoryCard ? `
            <div style="text-align:left; margin-bottom:10px;">
                <div style="color:var(--gold); font-weight:900; font-size:1rem;">제 ${data.r}회 결과</div>
                <div style="color:var(--dim); font-size:0.7rem; margin-top:4px;">추첨일: ${data.date}</div>
            </div>
            <div class="prize-row">
                <span class="p-gold">1등: ${currentMode === 'lotto' ? (data.r1m || '--') : '월 700만원'}</span>
                <span class="p-blue">2등: ${currentMode === 'lotto' ? (data.r2m || '--') : '월 100만원'}</span>
            </div>
        ` : `
            <div class="ai-comment">스마트 필터와 통계 점수를 반영한 조합입니다.<br>카드를 눌러 상세 지표를 확인하세요.</div>
        `}

        <div class="ball-group">
            ${data.group ? `<div class="group-tag">${data.group}</div>` : ''}
            ${balls}
            ${isHistoryCard && currentMode === 'lotto' && data.b ? `<span style="align-self:center; font-weight:900; margin:0 5px;">+</span><div class="ball ${getLottoCol(data.b)}">${data.b}</div>` : ''}
        </div>
        <div class="metrics-grid">${metricsHtml}</div>
        ${!isHistoryCard ? `
            <div class="card-btn-group">
                <button class="btn-card-action" onclick="copyToClipboard([${data.n}], '${data.group || ''}')">📋 복사</button>
                <button class="btn-card-action" onclick="captureCard('${uid}')">📸 이미지 저장</button>
            </div>
        ` : ''}
    `;

    target.appendChild(card);
}

function addMoreButton(container, totalLen, currentLen, type) {
    if (totalLen <= currentLen) return;
    const wrap = document.createElement('div');
    wrap.className = 'more-btn-container';
    const btn = document.createElement('button');
    btn.className = 'btn-load-more';
    btn.innerText = `결과 20개 더보기 (${currentLen}/${totalLen})`;
    btn.onclick = (e) => {
        e.stopPropagation();
        pageStatus[type] += 20;
        if (type === 'win') renderH();
        else if (type === 'history') loadGlobalTimeline();
        else if (type === 'store') renderS();
    };
    wrap.appendChild(btn);
    container.appendChild(wrap);
}

function switchTab(tab, el) {
    document.querySelectorAll('.tab').forEach(node => node.classList.remove('active'));
    el.classList.add('active');
    ['gen-panel', 'stats-panel', 'win-panel', 'history-panel', 'store-panel'].forEach(id => {
        const panel = document.getElementById(id);
        if (panel) panel.classList.add('hidden');
    });
    document.getElementById(`${tab}-panel`).classList.remove('hidden');

    if (tab === 'stats') {
        renderHeatmap();
        renderAdvancedInsights();
    }
    if (tab === 'win') renderH();
    if (tab === 'history') loadGlobalTimeline();
    if (tab === 'store') renderS();

    log(`📂 [${el.innerText}] 탭으로 이동했습니다.`);
}

function updateStatsRange(range, el) {
    currentStatsRange = range;
    el.parentElement.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    renderHeatmap();
    renderAdvancedInsights();
}

function getNumberDomain() {
    return currentMode === 'lotto' ? { start: 1, end: 45 } : { start: 0, end: 9 };
}

function collectFrequency(dataSlice) {
    const counts = {};
    dataSlice.forEach(round => {
        round.n.forEach(num => counts[num] = (counts[num] || 0) + 1);
        if (currentMode === 'lotto' && round.b) counts[round.b] = (counts[round.b] || 0) + 1;
    });
    return counts;
}

function renderAdvancedInsights() {
    const data = DB[currentMode];
    if (!data.length) return;

    const latest10 = data.slice(0, 10);
    const latest50 = data.slice(0, 50);
    const c10 = collectFrequency(latest10);
    const c50 = collectFrequency(latest50);
    const { start, end } = getNumberDomain();
    const domain = Array.from({ length: end - start + 1 }, (_, i) => i + start);

    const momentum = domain
        .map(n => {
            const r10 = (c10[n] || 0) / Math.max(latest10.length, 1);
            const r50 = (c50[n] || 0) / Math.max(latest50.length, 1);
            return { n, gain: r10 - r50 };
        })
        .sort((a, b) => b.gain - a.gain)
        .slice(0, 5)
        .map(v => `${v.n}(${v.gain > 0 ? '+' : ''}${(v.gain * 100).toFixed(1)}%)`);

    const overdue = domain
        .map(n => {
            const idx = data.findIndex(round => round.n.includes(n) || (currentMode === 'lotto' && round.b === n));
            return { n, gap: idx < 0 ? 999 : idx };
        })
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 5)
        .map(v => `${v.n}(${v.gap === 999 ? '기록없음' : `${v.gap}회`})`);

    const momentumEl = document.getElementById('insight-momentum');
    const overdueEl = document.getElementById('insight-overdue');
    const balanceEl = document.getElementById('insight-balance');
    const strategyEl = document.getElementById('insight-strategy');
    const chipsWrap = document.getElementById('insight-strategy-chips');

    if (momentumEl) momentumEl.innerText = momentum.join(' · ');
    if (overdueEl) overdueEl.innerText = overdue.join(' · ');

    if (balanceEl) {
        if (currentMode === 'lotto') {
            const zones = [0, 0, 0, 0, 0];
            latest10.forEach(round => {
                round.n.forEach(n => {
                    if (n <= 9) zones[0]++;
                    else if (n <= 18) zones[1]++;
                    else if (n <= 27) zones[2]++;
                    else if (n <= 36) zones[3]++;
                    else zones[4]++;
                });
            });
            const spread = Math.max(...zones) - Math.min(...zones);
            const status = spread <= 4 ? '균형 우수' : (spread <= 8 ? '약간 편향' : '강한 편향');
            balanceEl.innerText = `1-9:${zones[0]} / 10-18:${zones[1]} / 19-27:${zones[2]} / 28-36:${zones[3]} / 37-45:${zones[4]} (${status})`;
        } else {
            const posInfo = Array.from({ length: 6 }, (_, idx) => `${idx + 1}열:${new Set(latest10.map(r => r.n[idx])).size}`);
            balanceEl.innerText = `자리 다양성 → ${posInfo.join(' / ')}`;
        }
    }

    if (strategyEl) {
        strategyEl.innerText = currentMode === 'lotto'
            ? '강세 2수 + 이월 1수 + 장기 미출현 1수 조합을 권장'
            : '강세 숫자와 역추적 숫자를 섞어 3~5세트 분산 추천';
    }

    if (chipsWrap) {
        chipsWrap.innerHTML = '';
        const labels = currentMode === 'lotto'
            ? ['이월수 0~2개', '인접수 0~2개', '중복조합 차단', '점수 높은 순 정렬']
            : ['자리 분산 우선', '중복조합 차단', '점수 높은 순 정렬', '세트 운용 적합'];
        labels.forEach(text => {
            const chip = document.createElement('div');
            chip.className = 'insight-chip';
            chip.innerText = text;
            chipsWrap.appendChild(chip);
        });
    }
}

function renderHeatmap() {
    const grid = document.getElementById('heatmap-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const data = DB[currentMode].slice(0, currentStatsRange);
    const counts = {};
    const { start, end } = getNumberDomain();
    data.forEach(round => {
        round.n.forEach(num => counts[num] = (counts[num] || 0) + 1);
        if (currentMode === 'lotto' && round.b) counts[round.b] = (counts[round.b] || 0) + 1;
    });

    const values = Object.values(counts);
    const maxCount = Math.max(...(values.length ? values : [1]));
    for (let i = start; i <= end; i++) {
        const count = counts[i] || 0;
        const ratio = count / maxCount;
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        if (count > 0) {
            cell.classList.add('active');
            cell.style.backgroundColor = `rgba(56, 189, 248, ${0.1 + ratio * 0.6})`;
            cell.style.borderColor = `rgba(56, 189, 248, ${0.3 + ratio * 0.7})`;
        }
        cell.innerHTML = `<span class="hm-num" style="color:${ratio > 0.7 ? '#fff' : 'var(--text)'}">${i}</span><span class="hm-count">${count}회</span>`;
        grid.appendChild(cell);
    }

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const maxEl = document.getElementById('stat-max-n');
    const minEl = document.getElementById('stat-min-n');
    if (maxEl) maxEl.innerText = sorted[0] ? `${sorted[0][0]}번` : '--';
    const unappeared = Array.from({ length: end - start + 1 }, (_, idx) => idx + start).filter(n => !counts[n]);
    if (minEl) minEl.innerText = unappeared.length ? `${unappeared[0]}번` : '--';
}

function renderH() {
    const list = document.getElementById('win-list');
    if (!list) return;
    list.innerHTML = '';
    const fullData = DB[currentMode];
    const visible = fullData.slice(0, pageStatus.win);
    visible.forEach(item => renderCard(list, { ...item, ...getMetrics(item.n, currentMode) }, true));
    addMoreButton(list, fullData.length, pageStatus.win, 'win');
}

function saveData() {
    if (!window.sessionData.length) return;
    const key = getStorageKey();
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    const map = new Map(saved.map(item => [`${item.targetRound || ''}:${item.group || ''}:${item.n.join('-')}`, item]));
    window.sessionData.forEach(item => {
        map.set(`${item.targetRound || ''}:${item.group || ''}:${item.n.join('-')}`, item);
    });
    const merged = [...map.values()];
    localStorage.setItem(key, JSON.stringify(merged));
    alert('💾 저장소 보관 완료');
    updateBatchCopyBtn('store');
    log(`💾 ${window.sessionData.length}건을 저장소에 반영했습니다.`);
}

function parseTimelineNumbers(raw) {
    if (Array.isArray(raw)) return raw.map(Number);
    if (typeof raw === 'string') return raw.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !Number.isNaN(n));
    return [];
}

function checkLivePrize(mode, myNums, targetRound, myGroup) {
    const winData = DB[mode].find(d => d.r === parseInt(targetRound, 10));
    if (!winData) return { label: `${targetRound}회 대기`, class: 'badge-waiting' };

    if (mode === 'lotto') {
        const match = myNums.filter(n => winData.n.includes(n)).length;
        const bonus = myNums.includes(winData.b);
        if (match === 6) return { label: '1등 당첨!', class: 'badge-win-1' };
        if (match === 5 && bonus) return { label: '2등 당첨!', class: 'badge-win-2' };
        if (match === 5) return { label: '3등 당첨', class: 'badge-win-3' };
        if (match === 4) return { label: '4등 당첨', class: 'badge-win-4' };
        if (match === 3) return { label: '5등 당첨', class: 'badge-win-5' };
        return { label: '낙첨', class: 'badge-lose' };
    }

    const winStr = winData.n.join('');
    const myStr = myNums.map(n => n.toString()).join('');
    const myG = myGroup ? myGroup.toString().replace(/[^0-9]/g, '') : '';
    if (myG === winData.group && winStr === myStr) return { label: '1등 당첨!', class: 'badge-win-1' };

    let mLen = 0;
    for (let i = 5; i >= 0; i--) {
        if (winStr[i] === myStr[i]) mLen++;
        else break;
    }
    if (mLen === 6) return { label: '2등 당첨', class: 'badge-win-2' };
    if (mLen === 5) return { label: '3등 당첨', class: 'badge-win-3' };
    if (mLen === 4) return { label: '4등 당첨', class: 'badge-win-4' };
    if (mLen === 3) return { label: '5등 당첨', class: 'badge-win-5' };
    if (mLen === 2) return { label: '6등 당첨', class: 'badge-win-6' };
    if (mLen === 1) return { label: '7등 당첨', class: 'badge-win-7' };
    return { label: '낙첨', class: 'badge-lose' };
}

async function loadGlobalTimeline() {
    const list = document.getElementById('history-list');
    if (!list) return;
    if (pageStatus.history === 20) list.innerHTML = '<div class="ai-comment">📡 실시간 분석 타임라인 동기화 중...</div>';

    try {
        const res = await fetch(API_URLS[currentMode]);
        const data = await res.json();
        list.innerHTML = '';
        if (!data || !data.length) {
            list.innerHTML = '<div class="ai-comment">최근 생성 기록이 없습니다.</div>';
            return;
        }

        data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        _historyTimelineData = data;
        const batchRow = document.getElementById('history-batch-row');
        if (batchRow) { batchRow.style.display = data.length ? 'flex' : 'none'; }
        const visible = data.slice(0, pageStatus.history);
        visible.forEach(item => {
            const dateObj = new Date(item.timestamp);
            const dateStr = dateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\s/g, '');
            const timeStr = dateObj.toLocaleTimeString('ko-KR', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const nums = parseTimelineNumbers(item.numbers).map(n => n.toString().padStart(currentMode === 'lotto' ? 2 : 1, '0'));
            const prize = checkLivePrize(currentMode, nums.map(Number), item.round, item.group);

            const card = document.createElement('div');
            const uid = `hcard-${Math.random().toString(36).slice(2, 11)}`;
            card.id = uid;
            card.className = 'history-card';
            card.style.cursor = 'default';
            const ballsHtml = nums.map((num, idx) => {
                const value = parseInt(num, 10);
                const ballClass = currentMode === 'lotto' ? getLottoCol(value) : `b${(idx % 6) + 1}`;
                return `<div class="ball ${ballClass}">${num}</div>`;
            }).join('');

            const numsArr = nums.map(Number);
            const groupLabel = item.group || '';

            card.innerHTML = `
                <div class="badge">
                    <span class="badge-unit ${prize.class}">${prize.label}</span>
                    <span class="badge-unit badge-${(item.grade || 'NORMAL').toLowerCase()}">${item.grade || 'NORMAL'}</span>
                </div>
                <div style="font-size:0.75rem; font-weight:800; color:var(--gold); margin-bottom:12px; line-height:1.4;">
                    제 ${item.round}회 분석<br>
                    <span style="color:var(--dim); font-size:0.65rem;">${dateStr} ${timeStr}</span>
                </div>
                <div class="ball-group" style="margin-bottom:12px; justify-content:center;">${ballsHtml}</div>
                <div class="card-btn-group">
                    <button class="btn-card-action" onclick="copyToClipboard([${numsArr}], '${groupLabel}')">📋 복사</button>
                    <button class="btn-card-action" onclick="captureCard('${uid}')">📸 이미지 저장</button>
                    <button class="btn-card-action" onclick="saveHistoryItemToStore(${JSON.stringify(numsArr)}, '${groupLabel}', ${item.round})">💾 저장소</button>
                </div>
            `;
            list.appendChild(card);
        });

        addMoreButton(list, data.length, pageStatus.history, 'history');
    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="ai-comment">⚠️ 데이터를 로드할 수 없습니다.</div>';
    }
}

function saveHistoryItemToStore(numsArr, group, round) {
    const key = getStorageKey();
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    const metrics = getMetrics(numsArr, currentMode);
    const newItem = { n: numsArr, group: group || '', targetRound: round, ...metrics };
    const mapKey = `${round}:${group || ''}:${numsArr.join('-')}`;
    const map = new Map(saved.map(item => [`${item.targetRound || ''}:${item.group || ''}:${item.n.join('-')}`, item]));
    if (map.has(mapKey)) {
        alert('이미 저장소에 있는 조합입니다.');
        return;
    }
    map.set(mapKey, newItem);
    localStorage.setItem(key, JSON.stringify([...map.values()]));
    alert('💾 저장소에 보관 완료!');
    updateBatchCopyBtn('store');
}

let _historyTimelineData = [];

function copyBatchHistory() {
    if (!_historyTimelineData.length) return;
    const text = _historyTimelineData.map(item => {
        const nums = parseTimelineNumbers(item.numbers);
        const group = item.group || '';
        return `${group ? group + ' ' : ''}${formatNums(nums)}`;
    }).join('\n');
    navigator.clipboard.writeText(text);
    alert('📋 복사 완료');
}

async function captureSlipHistory() {
    if (!_historyTimelineData.length) return;
    const fakeData = _historyTimelineData.map(item => {
        const nums = parseTimelineNumbers(item.numbers);
        const metrics = getMetrics(nums, currentMode);
        return { n: nums, group: item.group || '', targetRound: item.round, ...metrics };
    });
    // Temporarily replace sessionData to reuse captureSlip logic
    const backup = window.sessionData;
    window.sessionData = fakeData;
    await captureSlip('gen');
    window.sessionData = backup;
}

function renderS() {
    const list = document.getElementById('store-list');
    const batchRow = document.getElementById('store-batch-row');
    if (!list || !batchRow) return;

    const key = getStorageKey();
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    list.innerHTML = '';

    if (!saved.length) {
        batchRow.style.display = 'none';
        list.innerHTML = '<div class="ai-comment" style="text-align:center;">📂 보관된 조합이 없습니다.</div>';
        updateBatchCopyBtn('store');
        return;
    }

    batchRow.style.display = 'flex';
    const visible = saved.slice(0, pageStatus.store);
    visible.forEach(item => {
        const targetRound = item.targetRound || (DB[currentMode][0]?.r + 1 || 0);
        const prize = checkLivePrize(currentMode, item.n.map(Number), targetRound, item.group);
        const uid = `store-${Math.random().toString(36).slice(2, 11)}`;
        const card = document.createElement('div');
        card.id = uid;
        card.className = 'res-card collapsed';
        card.onclick = (e) => {
            if (!e.target.closest('button')) card.classList.toggle('collapsed');
        };

        const metrics = currentMode === 'lotto'
            ? `
                <div class="mt-box"><span class="mt-label">홀짝</span><span class="mt-val">${item.m1}</span></div>
                <div class="mt-box"><span class="mt-label">저고</span><span class="mt-val">${item.m2}</span></div>
                <div class="mt-box"><span class="mt-label">AC값</span><span class="mt-val highlight">${item.m3}</span></div>
                <div class="mt-box"><span class="mt-label">끝수합</span><span class="mt-val">${item.m4}</span></div>
                <div class="mt-box"><span class="mt-label">총합</span><span class="mt-val highlight">${item.m5}</span></div>
                <div class="mt-box"><span class="mt-label">범위</span><span class="mt-val">${item.m6}</span></div>
                <div class="mt-box"><span class="mt-label">평균</span><span class="mt-val">${item.m7}</span></div>
                <div class="mt-box"><span class="mt-label">연속</span><span class="mt-val highlight">${item.m8}</span></div>
                <div class="mt-box"><span class="mt-label">끝중복</span><span class="mt-val">${item.m9}</span></div>
                <div class="mt-box"><span class="mt-label">구간분포</span><span class="mt-val">${item.m10}</span></div>
                <div class="mt-box"><span class="mt-label">소수</span><span class="mt-val highlight">${item.m11}</span></div>
                <div class="mt-box"><span class="mt-label">이월수</span><span class="mt-val highlight">${item.m12 ?? 0}</span></div>
                <div class="mt-box"><span class="mt-label">인접수</span><span class="mt-val">${item.m13 ?? 0}</span></div>
            `
            : `
                <div class="mt-box"><span class="mt-label">자리 매칭</span><span class="mt-val highlight">${item.p1}</span></div>
                <div class="mt-box"><span class="mt-label">디지트 합</span><span class="mt-val highlight">${item.p2}</span></div>
                <div class="mt-box"><span class="mt-label">저고 비율</span><span class="mt-val">${item.p3}</span></div>
                <div class="mt-box"><span class="mt-label">홀짝 비율</span><span class="mt-val">${item.p4}</span></div>
                <div class="mt-box"><span class="mt-label">연속 패턴</span><span class="mt-val highlight">${item.p5}</span></div>
                <div class="mt-box"><span class="mt-label">끝3자 합</span><span class="mt-val">${item.p6}</span></div>
                <div class="mt-box"><span class="mt-label">평균값</span><span class="mt-val">${item.p7}</span></div>
                <div class="mt-box"><span class="mt-label">소수포함</span><span class="mt-val highlight">${item.p8}</span></div>
                <div class="mt-box"><span class="mt-label">중복없는 수</span><span class="mt-val">${item.p9}</span></div>
            `;

        const balls = item.n.map((n, idx) => {
            const ballClass = currentMode === 'lotto' ? getLottoCol(n) : `b${idx + 1}`;
            return `<div class="ball ${ballClass}">${n}</div>`;
        }).join('');

        card.innerHTML = `
            <div class="badge">
                <span class="badge-unit ${prize.class}">${prize.label}</span>
                <span class="badge-unit badge-${(item.grade || 'NORMAL').toLowerCase()}">${item.grade || 'NORMAL'} ${item.score || '--'}%</span>
            </div>
            <div style="font-size:0.75rem; font-weight:800; color:var(--gold); margin-bottom:12px;">제 ${targetRound}회 분석 조합</div>
            <div class="ball-group">${item.group ? `<div class="group-tag">${item.group}</div>` : ''}${balls}</div>
            <div class="metrics-grid">${metrics}</div>
            <div class="card-btn-group">
                <button class="btn-card-action" onclick="copyToClipboard([${item.n}], '${item.group || ''}')">📋 복사</button>
                <button class="btn-card-action" onclick="captureCard('${uid}')">📸 이미지 저장</button>
            </div>
        `;
        list.appendChild(card);
    });

    addMoreButton(list, saved.length, pageStatus.store, 'store');
    updateBatchCopyBtn('store');
}

function resetStore() {
    if (!confirm('비우시겠습니까?')) return;
    localStorage.removeItem(getStorageKey());
    renderS();
    log('🗑️ 저장소를 비웠습니다.');
}

window.onscroll = () => {
    const btn = document.getElementById('btn-top');
    if (btn) btn.style.display = document.documentElement.scrollTop > 300 ? 'flex' : 'none';
};

async function captureCard(id) {
    const card = document.getElementById(id);
    if (!card) return;
    const wasCollapsed = card.classList.contains('collapsed');
    card.classList.remove('collapsed');
    log('📸 분석 이미지 생성 중...');

    try {
        const canvas = await html2canvas(card, {
            backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg') || '#000',
            scale: 3,
            useCORS: true
        });
        const imageData = canvas.toDataURL('image/png');
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        if (!isMobile) {
            const link = document.createElement('a');
            const latest = DB[currentMode][0];
            const roundNum = latest ? latest.r + 1 : '0000';
            link.href = imageData;
            link.download = `QUANTUM_CARD_${currentMode.toUpperCase()}_R${roundNum}_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            log('✅ 개별 이미지 저장 완료');
        } else {
            const newWin = window.open('', '_blank');
            if (newWin) {
                newWin.document.write(`
                    <body style="margin:0; background:#000; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; color:#fff;">
                        <p style="margin-bottom:20px; font-size:16px;">👇 이미지를 길게 눌러 <b>[사진 앱에 저장]</b> 하세요</p>
                        <img src="${imageData}" style="max-width:90%; border-radius:15px; box-shadow:0 0 30px rgba(56,189,248,0.4);" />
                        <button onclick="window.close()" style="margin-top:30px; padding:12px 25px; background:#334155; color:#fff; border:none; border-radius:10px; font-weight:800; cursor:pointer;">닫기</button>
                    </body>
                `);
            }
        }
    } catch (e) {
        console.error(e);
        log('⚠️ 이미지 생성 실패');
    }

    if (wasCollapsed) card.classList.add('collapsed');
}

async function captureSlip(type) {
    const key = getStorageKey();
    const data = type === 'gen' ? window.sessionData : JSON.parse(localStorage.getItem(key) || '[]');
    if (!data.length) return;

    const now = new Date();
    const uid = Math.random().toString(36).slice(2, 11).toUpperCase();
    const fullTimeStamp = Date.now();
    const drawTargetDay = currentMode === 'lotto' ? 6 : 4;
    let drawDate = new Date();
    const dayDiff = (drawTargetDay + 7 - now.getDay()) % 7;
    if (dayDiff === 0 && now.getHours() >= 20) drawDate.setDate(now.getDate() + 7);
    else drawDate.setDate(now.getDate() + dayDiff);

    const weekName = ['일', '월', '화', '수', '목', '금', '토'];
    const drawDateStr = `추첨일 : ${drawDate.getFullYear()}.${String(drawDate.getMonth() + 1).padStart(2, '0')}.${String(drawDate.getDate()).padStart(2, '0')} (${weekName[drawDate.getDay()]})`;
    const combinedDateStr = `조합일 : ${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const watermarkContainer = document.getElementById('slip-watermark');
    const slipTitle = document.getElementById('slip-title');
    const slipDrawDate = document.getElementById('slip-draw-date');
    const slipTime = document.getElementById('slip-time');
    const slipTrx = document.getElementById('slip-trx');
    const slipRound = document.getElementById('slip-round');
    const slipPrice = document.getElementById('slip-price');
    const listTarget = document.getElementById('slip-list-target');
    const zone = document.getElementById('slip-render-zone');

    if (!watermarkContainer || !slipTitle || !slipDrawDate || !slipTime || !slipTrx || !slipRound || !slipPrice || !listTarget || !zone) return;

    const watermarkText = currentMode === 'lotto' ? 'QUANTUM LOTTO' : 'QUANTUM PENSION';
    watermarkContainer.innerHTML = '';
    for (let i = 0; i < 60; i++) {
        const span = document.createElement('span');
        span.className = 'watermark-text';
        span.innerText = watermarkText;
        watermarkContainer.appendChild(span);
    }

    slipTitle.innerText = watermarkText;
    slipDrawDate.innerText = drawDateStr;
    slipTime.innerText = combinedDateStr;
    slipTrx.innerText = `TRX : QT-${uid}`;

    const latest = DB[currentMode][0];
    const roundNum = latest ? latest.r + 1 : '0000';
    const totalPages = Math.ceil(data.length / 5);
    const images = [];

    log(`📸 총 ${data.length}개 조합 슬립 생성 중...`);

    for (let page = 0; page < totalPages; page++) {
        const chunk = data.slice(page * 5, (page + 1) * 5);
        slipRound.innerHTML = `<span style="color:#f43f5e; font-weight:900;">[&nbsp;${page + 1}&nbsp;/&nbsp;${totalPages}&nbsp;]</span> &nbsp; 제 &nbsp; ${roundNum} &nbsp; 회`;
        slipPrice.innerText = `금액 ₩ ${(chunk.length * 1000).toLocaleString()}`;
        listTarget.innerHTML = chunk.map((item, idx) => {
            const charIdx = String.fromCharCode(65 + idx);
            const numsHtml = item.n.map(n => `<span class="slip-num-unit">${n.toString().padStart(currentMode === 'lotto' ? 2 : 1, '0')}</span>`).join('');
            return `
                <div class="slip-row">
                    <span class="slip-tag">${charIdx} 조합</span>
                    ${item.group ? `<span class="slip-group-val">${item.group}</span>` : ''}
                    <div class="slip-num-container">${numsHtml}</div>
                </div>
            `;
        }).join('');

        try {
            const canvas = await html2canvas(zone, { scale: 3, backgroundColor: '#fff', useCORS: true });
            images.push(canvas.toDataURL('image/png'));
        } catch (e) {
            console.error(e);
            log(`⚠️ ${page + 1}번 슬립 생성 실패`);
        }
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const sysName = currentMode === 'lotto' ? 'QUANTUM_LOTTO' : 'QUANTUM_PENSION';
    if (!isMobile) {
        images.forEach((src, idx) => {
            const link = document.createElement('a');
            link.href = src;
            link.download = `${sysName}_R${roundNum}_P${idx + 1}-${uid}_${fullTimeStamp}.png`;
            document.body.appendChild(link);
            link.click();
            link.remove();
        });
        log(`✅ 분석 리포트 저장 완료 (${uid})`);
        return;
    }

    const newWin = window.open('', '_blank');
    if (!newWin) return;
    const imgTags = images.map((src, idx) => `
        <div class="slide" style="display:${idx === 0 ? 'flex' : 'none'}; flex-direction:column; align-items:center;">
            <p style="margin-bottom:20px; font-size:16px; font-weight:900;">👇 [${idx + 1}/${images.length}] 길게 눌러 이미지 저장</p>
            <img src="${src}" style="max-width:95%; border-radius:5px; box-shadow:0 0 30px rgba(255,255,255,0.2);" />
        </div>
    `).join('');

    newWin.document.write(`
        <body style="margin:0; background:#000; color:#fff; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; overflow-y:auto; padding:20px 0;">
            <div id="slider-container" style="width:100%; display:flex; flex-direction:column; align-items:center;">${imgTags}</div>
            <div style="display:flex; gap:20px; margin-top:30px;">
                <button onclick="move(-1)" style="padding:15px 35px; background:#334155; color:#fff; border:none; border-radius:12px; font-weight:900; font-size:16px;">이전</button>
                <button onclick="move(1)" style="padding:15px 35px; background:#38bdf8; color:#000; border:none; border-radius:12px; font-weight:900; font-size:16px;">다음</button>
            </div>
            <button onclick="window.close()" style="margin-top:25px; padding:12px 60px; background:#ef4444; color:#fff; border:none; border-radius:12px; font-weight:900; font-size:15px; cursor:pointer;">창 닫기</button>
            <script>
                let current = 0;
                const slides = document.getElementsByClassName('slide');
                function move(dir) {
                    slides[current].style.display = 'none';
                    current = (current + dir + slides.length) % slides.length;
                    slides[current].style.display = 'flex';
                    window.scrollTo(0, 0);
                }
            <\/script>
        </body>
    `);
    log(`✅ 모바일 뷰어 리포트 생성 완료 (${uid})`);
}
