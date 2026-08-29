"use strict";

const DATA_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRlGZv0VLyDVm6SviCjdd08hZpXWXHiPzcgXAurWBqGjsOOq1CPoRr1LRBzlnR80KDVa_ECBl96pAxJ/pub?output=csv";
const SAVE_API_URL = "https://script.google.com/macros/s/AKfycbxFjCoZUcfTYRmPiWjJL3Q4_5S5Dzq8TNRPI0_73VYrRJ1QuoHryi6I4qOE-7wxbH--/exec";

const STRATEGIES = Object.freeze({
    1: {
        name: "균형형 전략",
        description: "과거 빈도보다 홀짝·저고·구간·합계의 형태를 우선합니다.",
        summary: "특정 번호군에 힘을 싣지 않고 조합 자체의 균형을 가장 엄격하게 맞춥니다."
    },
    2: {
        name: "최근 10주 빈도 전략",
        description: "최근 10회 추첨에서 자주 등장한 번호에 조금 더 높은 가중치를 줍니다.",
        summary: "짧은 기간의 출현 빈도를 반영하되, 최근 번호만 몰리지 않도록 공통 검증 기준을 함께 적용합니다."
    },
    3: {
        name: "최근 20~50주 추세 전략",
        description: "중기 빈도와 최근 변화 폭을 함께 비교해 상승 흐름을 참고합니다.",
        summary: "일시적인 한두 번의 출현보다 20~50회 구간에서 이어지는 흐름에 무게를 둡니다."
    },
    4: {
        name: "장기 누적 빈도 전략",
        description: "전체 회차에서 꾸준히 출현한 번호의 누적 빈도를 참고합니다.",
        summary: "장기 기록에서 상대적으로 자주 등장한 번호를 중심 신호로 사용해 조합을 구성합니다."
    },
    5: {
        name: "미출현·저출현 반등 전략",
        description: "최근 쉬어 간 번호와 낮은 출현 빈도를 반등 후보로 참고합니다.",
        summary: "미출현 기간과 최근 저빈도 신호를 함께 반영하는 역추세형 전략입니다."
    },
    6: {
        name: "핫넘버 중심 전략",
        description: "최근 10회와 50회에서 출현 강도가 높은 번호를 중심으로 만듭니다.",
        summary: "최근 자주 나온 번호에 가장 강한 가중치를 주되 조합 간 중복과 번호 쏠림은 제한합니다."
    },
    7: {
        name: "콜드넘버 중심 전략",
        description: "최근 출현이 적거나 오랫동안 쉬어 간 번호를 중심으로 만듭니다.",
        summary: "최근 빈도가 낮은 번호와 미출현 간격이 긴 번호를 우선하는 반대 방향의 전략입니다."
    },
    8: {
        name: "혼합형 전략",
        description: "핫·콜드·장기 빈도·최근 추세 신호를 한 조합 안에 고르게 섞습니다.",
        summary: "한 가지 통계에 치우치지 않도록 네 가지 신호에서 후보를 고른 뒤 균형 검증을 거치는 기본 전략입니다."
    },
    9: {
        name: "계절·월별 패턴 전략",
        description: "현재 월의 과거 출현 기록과 중기 빈도를 함께 참고합니다.",
        summary: "같은 시기의 과거 기록을 보조 신호로 사용하며 표본 부족은 중기 빈도로 보완합니다."
    },
    10: {
        name: "고위험 랜덤 분산 전략",
        description: "통계 편향을 최소화하고 무작위성과 조합 간 분산을 더 강하게 적용합니다.",
        summary: "번호 선택은 넓게 분산하되 기본적인 홀짝·저고·구간 검증은 유지하는 변동성 높은 전략입니다."
    }
});

const state = {
    history: [],
    combinations: [],
    strategy: 8,
    quantity: 15,
    dataMode: "loading",
    savedRecords: [],
    lastSavedKey: "",
    saving: false,
    dom: {}
};

let toastTimer = null;

function randomFloat() {
    if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
        const value = new Uint32Array(1);
        globalThis.crypto.getRandomValues(value);
        return value[0] / 4294967296;
    }
    return Math.random();
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function parseCsvLine(line) {
    return line
        .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map((cell) => cell.trim().replace(/^"|"$/g, "").replace(/""/g, "\""));
}

function extractMonth(value) {
    const parts = String(value || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    return parts ? Number(parts[2]) : null;
}

function parseHistoryCsv(csv) {
    const rows = String(csv || "")
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .slice(1)
        .map(parseCsvLine)
        .map((cells) => ({
            round: Number(String(cells[0] || "").replace(/\D/g, "")),
            date: cells[1] || "",
            month: extractMonth(cells[1]),
            numbers: cells.slice(2, 8).map(Number).filter((number) => number >= 1 && number <= 45),
            bonus: Number(cells[8])
        }))
        .filter((row) => row.round && row.numbers.length === 6);

    return rows.sort((a, b) => b.round - a.round);
}

function countFrequency(rows) {
    const counts = Array(46).fill(0);
    rows.forEach((row) => row.numbers.forEach((number) => { counts[number] += 1; }));
    return counts;
}

function normalize(values) {
    const valid = values.slice(1).filter(Number.isFinite);
    const min = valid.length ? Math.min(...valid) : 0;
    const max = valid.length ? Math.max(...valid) : 0;
    const result = Array(46).fill(0.5);

    if (max === min) return result;
    for (let number = 1; number <= 45; number += 1) {
        result[number] = (values[number] - min) / (max - min);
    }
    return result;
}

function buildStats(history) {
    const recent10Rows = history.slice(0, 10);
    const recent50Rows = history.slice(0, 50);
    const currentMonth = new Date().getMonth() + 1;
    const sameMonthRows = history.filter((row) => row.month === currentMonth);

    const recent10Raw = countFrequency(recent10Rows);
    const recent50Raw = countFrequency(recent50Rows);
    const longRaw = countFrequency(history);
    const monthRaw = countFrequency(sameMonthRows);
    const gapRaw = Array(46).fill(0);
    const trendRaw = Array(46).fill(0);

    for (let number = 1; number <= 45; number += 1) {
        const lastIndex = history.findIndex((row) => row.numbers.includes(number));
        gapRaw[number] = lastIndex === -1 ? Math.max(20, history.length) : lastIndex;
        const shortRate = recent10Raw[number] / Math.max(1, recent10Rows.length);
        const mediumRate = recent50Raw[number] / Math.max(1, recent50Rows.length);
        trendRaw[number] = shortRate - mediumRate;
    }

    const recent10 = normalize(recent10Raw);
    const recent50 = normalize(recent50Raw);
    const long = normalize(longRaw);
    const month = normalize(monthRaw);
    const gap = normalize(gapRaw);
    const trend = normalize(trendRaw);
    const hot = Array(46).fill(0.5);
    const cold = Array(46).fill(0.5);

    for (let number = 1; number <= 45; number += 1) {
        hot[number] = recent10[number] * 0.65 + recent50[number] * 0.35;
        cold[number] = (1 - recent50[number]) * 0.55 + gap[number] * 0.45;
    }

    return { recent10, recent50, long, month, gap, trend, hot, cold };
}

function makeSignal(strategy, stats) {
    const signal = Array(46).fill(1);
    for (let number = 1; number <= 45; number += 1) {
        switch (Number(strategy)) {
        case 1:
            signal[number] = 1;
            break;
        case 2:
            signal[number] = 0.15 + stats.recent10[number] * 1.55 + stats.recent50[number] * 0.2;
            break;
        case 3:
            signal[number] = 0.15 + stats.trend[number] * 1.05 + stats.recent50[number] * 0.65;
            break;
        case 4:
            signal[number] = 0.18 + stats.long[number] * 1.65;
            break;
        case 5:
            signal[number] = 0.15 + stats.gap[number] * 1.05 + (1 - stats.recent50[number]) * 0.7;
            break;
        case 6:
            signal[number] = 0.08 + stats.hot[number] * 1.9;
            break;
        case 7:
            signal[number] = 0.08 + stats.cold[number] * 1.9;
            break;
        case 8:
            signal[number] = 0.16 + stats.hot[number] * 0.42 + stats.cold[number] * 0.28 + stats.long[number] * 0.3 + stats.trend[number] * 0.42;
            break;
        case 9:
            signal[number] = 0.16 + stats.month[number] * 1.05 + stats.recent50[number] * 0.38;
            break;
        case 10:
            signal[number] = 0.55 + randomFloat() * 1.15 + (number > 31 ? 0.12 : 0);
            break;
        default:
            signal[number] = 1;
        }
    }
    return signal;
}

function weightedPick(signal, excluded, usage) {
    const candidates = [];
    let total = 0;

    for (let number = 1; number <= 45; number += 1) {
        if (excluded.has(number)) continue;
        const usagePenalty = 1 + (usage[number] || 0) * 0.24;
        const weight = Math.max(0.001, signal[number] / usagePenalty);
        total += weight;
        candidates.push([number, total]);
    }

    let target = randomFloat() * total;
    for (const [number, ceiling] of candidates) {
        if (target <= ceiling) return number;
    }
    return candidates.at(-1)?.[0] || 1;
}

function createCandidate(strategy, stats, usage) {
    const selected = new Set();
    const mixedSignal = makeSignal(strategy, stats);

    if (Number(strategy) === 8) {
        [stats.hot, stats.cold, stats.long, stats.trend, mixedSignal, mixedSignal]
            .forEach((signal) => selected.add(weightedPick(signal, selected, usage)));
    } else {
        while (selected.size < 6) {
            const signal = Number(strategy) === 10 ? makeSignal(10, stats) : mixedSignal;
            selected.add(weightedPick(signal, selected, usage));
        }
    }

    return [...selected].sort((a, b) => a - b);
}

function zoneIndex(number) {
    if (number <= 10) return 0;
    if (number <= 20) return 1;
    if (number <= 30) return 2;
    if (number <= 40) return 3;
    return 4;
}

function calculateMetrics(numbers) {
    const zones = [0, 0, 0, 0, 0];
    const endings = new Map();
    let odd = 0;
    let low = 0;
    let consecutivePairs = 0;

    numbers.forEach((number, index) => {
        odd += number % 2;
        low += number <= 22 ? 1 : 0;
        zones[zoneIndex(number)] += 1;
        endings.set(number % 10, (endings.get(number % 10) || 0) + 1);
        if (index > 0 && number - numbers[index - 1] === 1) consecutivePairs += 1;
    });

    return {
        odd,
        even: 6 - odd,
        low,
        high: 6 - low,
        sum: numbers.reduce((total, number) => total + number, 0),
        zones,
        maxZone: Math.max(...zones),
        maxSameEnding: Math.max(...endings.values()),
        consecutivePairs,
        birthdayCount: numbers.filter((number) => number <= 31).length
    };
}

function overlapCount(left, right) {
    const rightSet = new Set(right);
    return left.reduce((count, number) => count + (rightSet.has(number) ? 1 : 0), 0);
}

function isSimplePattern(numbers) {
    const gaps = numbers.slice(1).map((number, index) => number - numbers[index]);
    return gaps.every((gap) => gap === gaps[0]);
}

function validateCombination(numbers, options = {}) {
    const {
        strategy = 8,
        latestNumbers = [],
        existing = [],
        maxOverlap = 3,
        relaxed = false
    } = options;

    if (!Array.isArray(numbers) || numbers.length !== 6) return false;
    if (new Set(numbers).size !== 6 || numbers.some((number) => number < 1 || number > 45)) return false;
    if (numbers.some((number, index) => index > 0 && number <= numbers[index - 1])) return false;

    const metrics = calculateMetrics(numbers);
    const sumMin = Number(strategy) === 1 && !relaxed ? 100 : 90;
    const sumMax = Number(strategy) === 1 && !relaxed ? 170 : 200;

    if (metrics.odd < 2 || metrics.odd > 4) return false;
    if (metrics.low < 2 || metrics.low > 4) return false;
    if (metrics.sum < sumMin || metrics.sum > sumMax) return false;
    if (metrics.maxZone > 3 || metrics.maxSameEnding > 2) return false;
    if (metrics.consecutivePairs > 1 || metrics.birthdayCount > 5) return false;
    if (isSimplePattern(numbers)) return false;
    if (latestNumbers.length === 6 && overlapCount(numbers, latestNumbers) > 3) return false;
    if (existing.some((combination) => overlapCount(numbers, combination) > maxOverlap)) return false;
    return true;
}

function generateCombinations({ strategy = 8, count = 15, history = [] } = {}) {
    const safeStrategy = clamp(Math.trunc(Number(strategy) || 8), 1, 10);
    const safeCount = clamp(Math.trunc(Number(count) || 15), 1, 30);
    const stats = buildStats(history);
    const latestNumbers = history[0]?.numbers || [];
    const usage = Array(46).fill(0);
    const combinations = [];
    const keys = new Set();
    const phases = [
        { maxOverlap: 3, relaxed: false, attempts: Math.max(7000, safeCount * 1900) },
        { maxOverlap: 4, relaxed: true, attempts: Math.max(5000, safeCount * 1200) }
    ];

    for (const phase of phases) {
        let attempts = 0;
        while (combinations.length < safeCount && attempts < phase.attempts) {
            attempts += 1;
            const candidate = createCandidate(safeStrategy, stats, usage);
            const key = candidate.join("-");
            if (keys.has(key)) continue;
            if (!validateCombination(candidate, {
                strategy: safeStrategy,
                latestNumbers,
                existing: combinations,
                maxOverlap: phase.maxOverlap,
                relaxed: phase.relaxed
            })) continue;

            combinations.push(candidate);
            keys.add(key);
            candidate.forEach((number) => { usage[number] += 1; });
        }
        if (combinations.length === safeCount) break;
    }

    if (combinations.length !== safeCount) {
        throw new Error("요청한 수량의 균형 조합을 만들지 못했습니다. 다시 시도해 주세요.");
    }
    return combinations;
}

function numberRangeClass(number) {
    if (number <= 10) return "range-1";
    if (number <= 20) return "range-2";
    if (number <= 30) return "range-3";
    if (number <= 40) return "range-4";
    return "range-5";
}

function formatNumber(number) {
    return String(number).padStart(2, "0");
}

function ballsMarkup(numbers) {
    return numbers.map((number) => `<span class="ball ${numberRangeClass(number)}">${number}</span>`).join("");
}

function getTargetRound(history = state.history) {
    return history[0]?.round ? Number(history[0].round) + 1 : 0;
}

function parseSavedNumbers(value) {
    const values = Array.isArray(value)
        ? value
        : String(value || "").match(/\d+/g) || [];
    return values.map(Number).filter((number) => number >= 1 && number <= 45).slice(0, 6).sort((a, b) => a - b);
}

function normalizeSavedRecord(item) {
    const numbers = parseSavedNumbers(item?.numbers ?? item?.n);
    const round = Number(item?.round ?? item?.targetRound);
    if (numbers.length !== 6 || new Set(numbers).size !== 6 || !round) return null;
    return {
        round,
        numbers,
        timestamp: item.timestamp || item.createdAt || "",
        mode: String(item.mode || "lotto").toLowerCase(),
        grade: String(item.grade || "").trim(),
        strategy: Number(item.strategy) || 0,
        strategyName: String(item.strategyName || "").trim()
    };
}

function strategyLabelForRecord(record) {
    if (record.strategyName) {
        return record.strategy ? `${record.strategy}번 ${record.strategyName}` : record.strategyName;
    }
    if (record.strategy >= 1 && record.strategy <= 10) return `${record.strategy}번 ${STRATEGIES[record.strategy].name}`;
    if (/^\d+번\s/.test(record.grade)) return record.grade;
    return record.grade ? `기존 생성 · ${record.grade}` : "기존 생성 방식";
}

function evaluatePrize(numbers, targetRound, history = state.history) {
    const winning = history.find((row) => Number(row.round) === Number(targetRound));
    if (!winning) {
        return { label: `${targetRound}회 결과 대기`, status: "waiting", rank: 0, matches: null, bonus: false };
    }

    const matches = overlapCount(numbers, winning.numbers);
    const bonus = numbers.includes(Number(winning.bonus));
    if (matches === 6) return { label: "1등 당첨", status: "winner", rank: 1, matches, bonus };
    if (matches === 5 && bonus) return { label: "2등 당첨", status: "winner", rank: 2, matches, bonus };
    if (matches === 5) return { label: "3등 당첨", status: "winner", rank: 3, matches, bonus };
    if (matches === 4) return { label: "4등 당첨", status: "winner", rank: 4, matches, bonus };
    if (matches === 3) return { label: "5등 당첨", status: "winner", rank: 5, matches, bonus };
    return { label: "낙첨", status: "lose", rank: 0, matches, bonus };
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;"
    })[character]);
}

function currentBatchKey() {
    return `${getTargetRound()}:${state.strategy}:${state.combinations.map((numbers) => numbers.join("-")).join("|")}`;
}

function cacheDom() {
    const ids = [
        "data-chip", "data-status", "latest-round", "latest-date", "latest-balls",
        "generator-form", "strategy-select", "strategy-description", "quantity-input",
        "quantity-minus", "quantity-plus", "generate-button", "generate-button-label",
        "selected-strategy-number", "selected-strategy-name", "selected-strategy-summary",
        "results", "results-subtitle", "save-button", "save-status", "copy-all-button", "download-button",
        "regenerate-button", "result-summary", "combination-list", "data-notice", "saved-history",
        "refresh-history-button", "history-summary", "history-list",
        "document-dialog", "document-title", "document-close", "document-frame", "toast"
    ];
    ids.forEach((id) => { state.dom[id] = document.getElementById(id); });
}

function updateStrategyView() {
    const strategy = STRATEGIES[state.strategy];
    state.dom["strategy-description"].textContent = strategy.description;
    state.dom["selected-strategy-number"].textContent = String(state.strategy).padStart(2, "0");
    state.dom["selected-strategy-name"].textContent = strategy.name;
    state.dom["selected-strategy-summary"].textContent = strategy.summary;
    updateGenerateLabel();
}

function updateQuantity(value) {
    state.quantity = clamp(Math.trunc(Number(value) || 1), 1, 30);
    state.dom["quantity-input"].value = state.quantity;
    document.querySelectorAll("[data-quantity]").forEach((button) => {
        button.classList.toggle("active", Number(button.dataset.quantity) === state.quantity);
    });
    updateGenerateLabel();
}

function updateGenerateLabel() {
    if (!state.dom["generate-button-label"]) return;
    const name = STRATEGIES[state.strategy].name.replace(" 전략", "");
    state.dom["generate-button-label"].textContent = `${state.strategy}번 ${name} ${state.quantity}조합 만들기`;
}

function renderLatestDraw() {
    const latest = state.history[0];
    if (!latest) {
        state.dom["latest-round"].textContent = "일반 균형 기준";
        state.dom["latest-date"].textContent = "과거 데이터 없이 생성 가능";
        state.dom["latest-balls"].innerHTML = "";
        return;
    }

    state.dom["latest-round"].textContent = `${latest.round.toLocaleString("ko-KR")}회`;
    state.dom["latest-date"].textContent = latest.date || "최근 회차";
    const bonus = Number.isFinite(latest.bonus) && latest.bonus >= 1 && latest.bonus <= 45
        ? `<span class="bonus-mark" aria-label="보너스">+</span><span class="ball ${numberRangeClass(latest.bonus)}" title="보너스 번호">${latest.bonus}</span>`
        : "";
    state.dom["latest-balls"].innerHTML = ballsMarkup(latest.numbers) + bonus;
}

function summarizeCombinations(combinations) {
    const unique = new Set(combinations.flat());
    const counts = Array(46).fill(0);
    combinations.flat().forEach((number) => { counts[number] += 1; });
    const averageSum = Math.round(combinations.reduce((total, numbers) => total + calculateMetrics(numbers).sum, 0) / combinations.length);
    let maxPairOverlap = 0;
    for (let left = 0; left < combinations.length; left += 1) {
        for (let right = left + 1; right < combinations.length; right += 1) {
            maxPairOverlap = Math.max(maxPairOverlap, overlapCount(combinations[left], combinations[right]));
        }
    }
    return {
        uniqueCount: unique.size,
        maxRepeat: Math.max(...counts),
        averageSum,
        maxPairOverlap
    };
}

function renderResults() {
    const strategy = STRATEGIES[state.strategy];
    const targetRound = getTargetRound();
    state.dom["results-subtitle"].textContent = `${targetRound ? `${targetRound}회 대상 · ` : ""}${state.strategy}번 ${strategy.name} · ${state.combinations.length}조합`;

    const summary = summarizeCombinations(state.combinations);
    state.dom["result-summary"].innerHTML = [
        ["사용한 번호", `${summary.uniqueCount}개 / 45개`],
        ["번호 최대 반복", `${summary.maxRepeat}회`],
        ["평균 합계", `${summary.averageSum}`],
        ["조합 간 최대 겹침", `${summary.maxPairOverlap}개`]
    ].map(([label, value]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong></div>`).join("");

    state.dom["combination-list"].innerHTML = state.combinations.map((numbers, index) => {
        const metrics = calculateMetrics(numbers);
        return `<article class="combination-card">
            <span class="combo-index">${String(index + 1).padStart(2, "0")}</span>
            <div class="combo-content">
                <div class="combo-balls" aria-label="${index + 1}번 조합: ${numbers.join(", ")}">${ballsMarkup(numbers)}</div>
                <div class="combo-metrics">
                    <span>홀짝 ${metrics.odd}:${metrics.even}</span>
                    <span>저고 ${metrics.low}:${metrics.high}</span>
                    <span>합계 ${metrics.sum}</span>
                    <span>구간 ${metrics.zones.join("·")}</span>
                    <span>연속 ${metrics.consecutivePairs}쌍</span>
                </div>
            </div>
            <button type="button" class="combo-copy" data-copy-index="${index}">복사</button>
        </article>`;
    }).join("");

    state.dom["data-notice"].textContent = state.dataMode === "live"
        ? `최근 ${state.history.length.toLocaleString("ko-KR")}개 회차 데이터를 번호 선택 가중치에 참고했습니다. 과거 출현 기록은 미래 결과를 예측하지 않습니다.`
        : "최신 데이터를 확인하지 못했으므로 일반적인 조합 균형 기준으로 생성했습니다. 인터넷 연결 후 다시 만들면 과거 회차 가중치가 반영됩니다.";
    if (state.dataMode === "live" && targetRound) setSaveStatus(`${targetRound}회 대상 · ${state.strategy}번 전략으로 스프레드시트에 저장할 준비가 됐습니다.`);
    else setSaveStatus("최신 회차를 확인할 수 없어 현재 조합은 스프레드시트에 저장하지 않습니다.", "error");
    state.dom.results.classList.remove("hidden");
}

function setSaveStatus(message, status = "") {
    const statusBox = state.dom["save-status"];
    const button = state.dom["save-button"];
    if (!statusBox || !button) return;

    statusBox.className = `save-status${status ? ` ${status}` : ""}`;
    statusBox.textContent = message;

    const alreadySaved = state.combinations.length && state.lastSavedKey === currentBatchKey();
    button.disabled = state.saving || alreadySaved || state.dataMode !== "live" || !state.combinations.length;
    button.textContent = state.saving ? "저장 중..." : alreadySaved ? "저장됨" : "스프레드시트 저장";
}

function buildSavePayload() {
    const targetRound = getTargetRound();
    const strategyName = STRATEGIES[state.strategy].name;
    const strategyLabel = `${state.strategy}번 ${strategyName}`;
    return state.combinations.map((numbers, index) => ({
        round: targetRound,
        mode: "lotto",
        numbers,
        group: "",
        grade: strategyLabel,
        strategy: state.strategy,
        strategyName,
        sequence: index + 1,
        source: "MIX645"
    }));
}

function currentBatchIsRecorded() {
    const targetRound = getTargetRound();
    const strategyLabel = `${state.strategy}번 ${STRATEGIES[state.strategy].name}`;
    return state.combinations.every((numbers) => state.savedRecords.some((record) => (
        record.round === targetRound
        && record.numbers.join("-") === numbers.join("-")
        && (record.grade === strategyLabel || record.strategy === state.strategy)
    )));
}

async function saveCurrentBatch({ silent = false } = {}) {
    if (!state.combinations.length || state.dataMode !== "live" || !getTargetRound()) {
        setSaveStatus("최신 회차가 연결된 상태에서 생성한 조합만 저장할 수 있습니다.", "error");
        return false;
    }

    const batchKey = currentBatchKey();
    if (state.lastSavedKey === batchKey) {
        if (!silent) showToast("현재 조합은 이미 저장했습니다.");
        return true;
    }

    state.saving = true;
    setSaveStatus(`${getTargetRound()}회 대상 조합을 스프레드시트에 저장하는 중입니다.`);
    try {
        await fetch(SAVE_API_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify(buildSavePayload())
        });
        state.lastSavedKey = batchKey;
        setSaveStatus(`${getTargetRound()}회 대상 · ${state.strategy}번 전략 · ${state.combinations.length}조합의 저장 요청을 보냈습니다.`, "saved");
        if (!silent) showToast(`${state.combinations.length}조합을 스프레드시트에 저장했습니다.`);

        window.setTimeout(async () => {
            await loadSavedHistory({ showLoading: false });
            if (currentBatchIsRecorded()) {
                setSaveStatus(`스프레드시트 저장 확인 · ${getTargetRound()}회 대상 · ${state.strategy}번 전략 · ${state.combinations.length}조합`, "saved");
            }
        }, 1400);
        return true;
    } catch (error) {
        console.error("MIX645 save error:", error);
        setSaveStatus("스프레드시트에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        if (!silent) showToast("저장하지 못했습니다.");
        return false;
    } finally {
        state.saving = false;
        setSaveStatus(state.dom["save-status"].textContent, state.dom["save-status"].classList.contains("error") ? "error" : "saved");
    }
}

function formatSavedTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "저장 시각 미확인";
    return date.toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function renderSavedHistory() {
    const allEvaluated = state.savedRecords.map((record) => ({ record, prize: evaluatePrize(record.numbers, record.round) }));
    const winningRecords = allEvaluated.filter(({ prize }) => prize.status === "winner");
    const otherRecords = allEvaluated.filter(({ prize }) => prize.status !== "winner");
    const evaluated = [...winningRecords, ...otherRecords].slice(0, 30);
    const waiting = allEvaluated.filter(({ prize }) => prize.status === "waiting").length;
    const checked = allEvaluated.length - waiting;

    state.dom["history-summary"].innerHTML = [
        ["저장 기록", `${allEvaluated.length}건`],
        ["당첨 조합", `${winningRecords.length}건`],
        ["결과 대기", `${waiting}건`],
        ["결과 확인", `${checked}건`]
    ].map(([label, value]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong></div>`).join("");

    if (!evaluated.length) {
        state.dom["history-list"].innerHTML = '<p class="history-empty">아직 저장된 로또 조합이 없습니다.</p>';
        return;
    }

    state.dom["history-list"].innerHTML = evaluated.map(({ record, prize }) => {
        const strategyLabel = escapeHtml(strategyLabelForRecord(record));
        const detail = prize.matches === null
            ? "당첨번호 발표 전"
            : `당첨번호 ${prize.matches}개 일치${prize.bonus ? " · 보너스 일치" : ""}`;
        return `<article class="history-card${prize.status === "winner" ? " is-winner" : ""}">
            <div class="history-card-head">
                <div class="history-card-title">
                    <strong>${record.round}회 · ${strategyLabel}</strong>
                    <span>${escapeHtml(formatSavedTimestamp(record.timestamp))}</span>
                </div>
                <span class="prize-badge ${prize.status}">${escapeHtml(prize.label)}</span>
            </div>
            <div class="history-balls" aria-label="${record.round}회 저장 조합 ${record.numbers.join(", ")}">${ballsMarkup(record.numbers)}</div>
            <div class="history-card-foot"><span>${escapeHtml(detail)}</span><strong>${record.round}회 대상</strong></div>
        </article>`;
    }).join("");
}

async function loadSavedHistory({ showLoading = true } = {}) {
    const refreshButton = state.dom["refresh-history-button"];
    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = "불러오는 중...";
    }
    if (showLoading) state.dom["history-list"].innerHTML = '<p class="history-empty">스프레드시트 저장 기록을 불러오는 중입니다.</p>';

    try {
        const separator = SAVE_API_URL.includes("?") ? "&" : "?";
        const response = await fetch(`${SAVE_API_URL}${separator}t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
        state.savedRecords = rows
            .map(normalizeSavedRecord)
            .filter((record) => record && (!record.mode || record.mode === "lotto"))
            .sort((left, right) => (Date.parse(right.timestamp) || 0) - (Date.parse(left.timestamp) || 0));
        renderSavedHistory();
        return state.savedRecords;
    } catch (error) {
        console.error("MIX645 history error:", error);
        state.dom["history-summary"].innerHTML = "";
        state.dom["history-list"].innerHTML = '<p class="history-empty">저장 기록을 불러오지 못했습니다. 조합 생성 기능은 정상적으로 이용할 수 있습니다.</p>';
        return [];
    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.textContent = "기록 새로고침";
        }
    }
}

function setGenerating(isGenerating) {
    state.dom["generate-button"].disabled = isGenerating || state.dataMode === "loading";
    state.dom["generate-button"].classList.toggle("loading", isGenerating);
    if (isGenerating) state.dom["generate-button-label"].textContent = "조합을 검증하는 중...";
    else updateGenerateLabel();
}

function generateCurrent({ scroll = true, persist = true } = {}) {
    setGenerating(true);
    window.setTimeout(() => {
        try {
            state.combinations = generateCombinations({
                strategy: state.strategy,
                count: state.quantity,
                history: state.history
            });
            renderResults();
            if (persist) saveCurrentBatch();
            if (scroll) state.dom.results.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (error) {
            showToast(error.message || "조합 생성에 실패했습니다. 다시 시도해 주세요.");
        } finally {
            setGenerating(false);
        }
    }, 30);
}

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
}

function combinationsAsTsv(combinations = state.combinations) {
    return combinations.map((numbers) => numbers.map(formatNumber).join("\t")).join("\n");
}

function combinationsAsTxt(combinations = state.combinations) {
    return combinations.map((numbers) => numbers.map(formatNumber).join(",")).join("\r\n");
}

function showToast(message) {
    if (!state.dom.toast) return;
    window.clearTimeout(toastTimer);
    state.dom.toast.textContent = message;
    state.dom.toast.classList.add("show");
    toastTimer = window.setTimeout(() => state.dom.toast.classList.remove("show"), 2200);
}

async function copyAll() {
    if (!state.combinations.length) return;
    try {
        await copyText(combinationsAsTsv());
        showToast(`${state.combinations.length}조합을 엑셀용 형식으로 복사했습니다.`);
    } catch {
        showToast("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
}

function downloadTxt() {
    if (!state.combinations.length) return;
    const blob = new Blob(["\uFEFF", combinationsAsTxt()], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = URL.createObjectURL(blob);
    link.download = `mix645_strategy${state.strategy}_${state.combinations.length}_combinations_${date}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    showToast("TXT 파일을 저장했습니다.");
}

function openDocument(path, title) {
    state.dom["document-title"].textContent = title;
    state.dom["document-frame"].src = path;
    if (typeof state.dom["document-dialog"].showModal === "function") state.dom["document-dialog"].showModal();
    else state.dom["document-dialog"].setAttribute("open", "");
    return false;
}

function closeDocument() {
    if (typeof state.dom["document-dialog"].close === "function") state.dom["document-dialog"].close();
    else state.dom["document-dialog"].removeAttribute("open");
    state.dom["document-frame"].src = "about:blank";
}

function bindEvents() {
    state.dom["generator-form"].addEventListener("submit", (event) => {
        event.preventDefault();
        generateCurrent();
    });
    state.dom["strategy-select"].addEventListener("change", (event) => {
        state.strategy = clamp(Number(event.target.value), 1, 10);
        updateStrategyView();
    });
    state.dom["quantity-input"].addEventListener("input", (event) => {
        if (event.target.value === "") return;
        updateQuantity(event.target.value);
    });
    state.dom["quantity-input"].addEventListener("change", (event) => updateQuantity(event.target.value));
    state.dom["quantity-minus"].addEventListener("click", () => updateQuantity(state.quantity - 1));
    state.dom["quantity-plus"].addEventListener("click", () => updateQuantity(state.quantity + 1));
    document.querySelectorAll("[data-quantity]").forEach((button) => {
        button.addEventListener("click", () => updateQuantity(button.dataset.quantity));
    });
    state.dom["copy-all-button"].addEventListener("click", copyAll);
    state.dom["save-button"].addEventListener("click", () => saveCurrentBatch());
    state.dom["download-button"].addEventListener("click", downloadTxt);
    state.dom["regenerate-button"].addEventListener("click", () => generateCurrent({ scroll: false }));
    state.dom["refresh-history-button"].addEventListener("click", () => loadSavedHistory());
    state.dom["combination-list"].addEventListener("click", async (event) => {
        const button = event.target.closest("[data-copy-index]");
        if (!button) return;
        const numbers = state.combinations[Number(button.dataset.copyIndex)];
        try {
            await copyText(numbers.map(formatNumber).join("\t"));
            showToast(`${Number(button.dataset.copyIndex) + 1}번 조합을 복사했습니다.`);
        } catch {
            showToast("복사하지 못했습니다.");
        }
    });
    state.dom["document-close"].addEventListener("click", closeDocument);
    state.dom["document-dialog"].addEventListener("click", (event) => {
        if (event.target === state.dom["document-dialog"]) closeDocument();
    });
}

async function loadHistory() {
    try {
        const response = await fetch(DATA_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const history = parseHistoryCsv(await response.text());
        if (history.length < 20) throw new Error("회차 데이터가 충분하지 않습니다.");
        state.history = history;
        state.dataMode = "live";
        state.dom["data-status"].textContent = `최근 데이터 연결 · ${history.length.toLocaleString("ko-KR")}회차`;
        state.dom["data-chip"].classList.add("ready");
    } catch (error) {
        console.warn("MIX645 data fallback:", error.message);
        state.history = [];
        state.dataMode = "fallback";
        state.dom["data-status"].textContent = "일반 균형 모드";
        state.dom["data-chip"].classList.add("fallback");
    }

    renderLatestDraw();
    state.dom["generate-button"].disabled = false;
    loadSavedHistory();
}

function initialize() {
    cacheDom();
    bindEvents();
    updateStrategyView();
    updateQuantity(15);
    loadHistory();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.openDocument = openDocument;
    window.addEventListener("DOMContentLoaded", initialize);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        STRATEGIES,
        parseHistoryCsv,
        buildStats,
        calculateMetrics,
        overlapCount,
        validateCombination,
        generateCombinations,
        parseSavedNumbers,
        normalizeSavedRecord,
        evaluatePrize,
        combinationsAsTsv,
        combinationsAsTxt
    };
}
