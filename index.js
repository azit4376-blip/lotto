"use strict";

const DATA_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRlGZv0VLyDVm6SviCjdd08hZpXWXHiPzcgXAurWBqGjsOOq1CPoRr1LRBzlnR80KDVa_ECBl96pAxJ/pub?output=csv";
const SAVE_API_URL = "https://script.google.com/macros/s/AKfycbxFjCoZUcfTYRmPiWjJL3Q4_5S5Dzq8TNRPI0_73VYrRJ1QuoHryi6I4qOE-7wxbH--/exec";
const HISTORY_PAGE_SIZE = 20;

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
    quantity: 5,
    generatedStrategy: 8,
    generatedRound: 0,
    dataMode: "loading",
    savedRecords: [],
    currentHistoryVisible: HISTORY_PAGE_SIZE,
    winningHistoryVisible: HISTORY_PAGE_SIZE,
    lastSavedKey: "",
    selectedIndexes: new Set(),
    selectedSavedRecordKeys: new Set(),
    qrPages: [],
    qrPage: 0,
    qrSourceLabel: "",
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

function generateCombinations({ strategy = 8, count = 5, history = [] } = {}) {
    const safeStrategy = clamp(Math.trunc(Number(strategy) || 8), 1, 10);
    const safeCount = clamp(Math.trunc(Number(count) || 5), 1, 30);
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

function normalizeMobileSlipGame(numbers) {
    const game = [...numbers].map(Number).sort((left, right) => left - right);
    if (game.length !== 6
        || game.some((number) => !Number.isInteger(number) || number < 1 || number > 45)
        || new Set(game).size !== 6) {
        throw new Error("각 조합은 중복 없이 1~45 사이 숫자 6개여야 합니다.");
    }
    return game;
}

function mobileSlipChecksum(text) {
    let checksum = 0;
    for (const character of text) {
        const code = character.charCodeAt(0);
        if (code > 127) throw new Error("모바일 슬립 데이터는 영문과 숫자 형식만 사용할 수 있습니다.");
        checksum ^= code;
        for (let bit = 0; bit < 8; bit += 1) {
            checksum = checksum & 128 ? ((checksum << 1) ^ 7) & 255 : (checksum << 1) & 255;
        }
    }
    return checksum.toString(16).padStart(2, "0").toUpperCase();
}

function buildMobileSlipPayload(games) {
    if (!games.length || games.length > 20) {
        throw new Error("QR 한 장에는 1~20조합을 담을 수 있습니다.");
    }

    const normalized = games.map(normalizeMobileSlipGame);
    const groups = [];
    for (let start = 0; start < normalized.length; start += 5) {
        const group = normalized.slice(start, start + 5);
        const entries = group.map((numbers) => `M:${numbers.map(formatNumber).join("")}`);
        groups.push(`(${group.length},${entries.join(",")})`);
    }

    const body = `MSG_ESLIP{10645}{${groups.join("")}}{}`;
    return `${body}${mobileSlipChecksum(body)}|`;
}

function splitMobileSlipGames(games) {
    const normalized = games.map(normalizeMobileSlipGame);
    const pages = [];
    for (let start = 0; start < normalized.length; start += 20) {
        pages.push(normalized.slice(start, start + 20));
    }
    return pages;
}

function parseManualGames(text) {
    const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return { games: [], errors: ["번호를 한 줄에 6개씩 입력해 주세요."] };
    if (lines.length > 100) return { games: [], errors: ["한 번에 최대 100조합까지 만들 수 있습니다."] };

    const games = [];
    const errors = [];
    lines.forEach((line, index) => {
        try {
            const numbers = (line.match(/\d+/g) || []).map(Number);
            games.push(normalizeMobileSlipGame(numbers));
        } catch {
            errors.push(`${index + 1}번째 줄을 확인해 주세요. 중복 없는 숫자 6개가 필요합니다.`);
        }
    });
    return { games, errors };
}

function mobileSlipSelfCheck() {
    return buildMobileSlipPayload([[2, 11, 19, 23, 38, 44]])
        === "MSG_ESLIP{10645}{(1,M:021119233844)}{}99|";
}

function mobileSlipPng(payload, games = [], firstGameNumber = 0, caption = "") {
    if (typeof globalThis.qrcode !== "function") {
        throw new Error("QR 생성 프로그램을 불러오지 못했습니다. 인터넷 연결 후 다시 시도해 주세요.");
    }

    const qr = globalThis.qrcode(0, "M");
    qr.addData(payload, "Byte");
    qr.make();

    const moduleCount = qr.getModuleCount();
    const margin = 4;
    const cellSize = Math.max(6, Math.floor(680 / (moduleCount + margin * 2)));
    const imageSize = (moduleCount + margin * 2) * cellSize;
    const columns = games.length > 10 ? 2 : 1;
    const rows = games.length ? Math.ceil(games.length / columns) : 0;
    const lineHeight = 28;
    const detailsHeight = games.length ? 84 + rows * lineHeight : 0;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = imageSize;
    canvas.height = imageSize + detailsHeight;
    context.imageSmoothingEnabled = false;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#05070a";

    for (let row = 0; row < moduleCount; row += 1) {
        for (let column = 0; column < moduleCount; column += 1) {
            if (qr.isDark(row, column)) {
                context.fillRect(
                    (column + margin) * cellSize,
                    (row + margin) * cellSize,
                    cellSize,
                    cellSize
                );
            }
        }
    }

    if (games.length) {
        const padding = 24;
        const listTop = imageSize + 66;
        const columnWidth = (imageSize - padding * 2) / columns;
        context.fillStyle = "#152533";
        context.font = `800 ${Math.max(15, Math.round(imageSize / 40))}px "Malgun Gothic", sans-serif`;
        context.textBaseline = "middle";
        context.fillText(caption || "MIX645 모바일 슬립", padding, imageSize + 28);
        context.strokeStyle = "#d8e2e5";
        context.beginPath();
        context.moveTo(padding, imageSize + 50);
        context.lineTo(imageSize - padding, imageSize + 50);
        context.stroke();
        context.font = `700 ${Math.max(14, Math.round(imageSize / 45))}px Consolas, monospace`;

        games.forEach((numbers, index) => {
            const column = Math.floor(index / rows);
            const row = index % rows;
            const gameNumber = String(firstGameNumber + index + 1).padStart(2, "0");
            context.fillText(
                `${gameNumber}  ${numbers.map(formatNumber).join(" ")}`,
                padding + column * columnWidth,
                listTop + row * lineHeight
            );
        });
    }

    return canvas.toDataURL("image/png");
}

function dataUrlToPngFile(dataUrl, filename) {
    const encoded = String(dataUrl).split(",")[1];
    if (!encoded) throw new Error("저장할 QR 이미지를 만들지 못했습니다.");
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new File([bytes], filename, { type: "image/png" });
}

function canShareQrImage() {
    if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
    try {
        return navigator.canShare({ files: [new File([new Uint8Array(1)], "mix645.png", { type: "image/png" })] });
    } catch {
        return false;
    }
}

async function shareQrImage() {
    try {
        const file = dataUrlToPngFile(state.dom["qr-download"].href, state.dom["qr-download"].download);
        if (!navigator.canShare({ files: [file] })) throw new Error("이미지 공유를 지원하지 않습니다.");
        await navigator.share({ files: [file], title: "MIX645 판매점용 QR" });
    } catch (error) {
        if (error?.name !== "AbortError") showToast("공유 메뉴를 열지 못했습니다. 파일 다운로드를 이용해 주세요.");
    }
}

function renderQrPage() {
    const games = state.qrPages[state.qrPage];
    if (!games?.length) return;

    const targetRound = getTargetRound();
    const totalGames = state.qrPages.reduce((total, page) => total + page.length, 0);
    const pageNumber = state.qrPage + 1;
    const pageCount = state.qrPages.length;
    const firstGameNumber = state.qrPage * 20;
    const payload = buildMobileSlipPayload(games);
    const dataUrl = mobileSlipPng(payload);
    const downloadDataUrl = mobileSlipPng(
        payload,
        games,
        firstGameNumber,
        `MIX645 · ${targetRound ? `${targetRound}회 · ` : ""}QR ${pageNumber}/${pageCount} · ${games.length}조합`
    );

    state.dom["qr-image"].src = dataUrl;
    state.dom["qr-image"].alt = `판매점용 모바일 슬립 QR ${pageNumber}/${pageCount}`;
    state.dom["qr-meta"].textContent = `${targetRound ? `${targetRound}회 구매용 · ` : ""}${state.qrSourceLabel} · ${totalGames}조합 · 예상 ${
        (totalGames * 1000).toLocaleString("ko-KR")
    }원`;
    state.dom["qr-page-label"].textContent = `QR ${pageNumber}/${pageCount} · ${games.length}조합`;
    state.dom["qr-page-count"].textContent = `${pageNumber} / ${pageCount}`;
    state.dom["qr-game-list"].innerHTML = games.map((numbers, index) => `
        <div><span>${String(firstGameNumber + index + 1).padStart(2, "0")}</span><strong>${numbers.map(formatNumber).join(" ")}</strong></div>
    `).join("");
    state.dom["qr-prev"].disabled = state.qrPage === 0;
    state.dom["qr-next"].disabled = state.qrPage === pageCount - 1;
    state.dom["qr-download"].href = downloadDataUrl;
    state.dom["qr-download"].download = `mix645-mobile-slip-${targetRound || "lotto"}-${pageNumber}.png`;
    const shareAvailable = canShareQrImage();
    state.dom["qr-share"].hidden = !shareAvailable;
    state.dom["qr-save-help"].hidden = !shareAvailable;
}

function openQrDialog(games, sourceLabel) {
    if (!games?.length) {
        showToast("QR로 만들 조합을 선택하거나 입력해 주세요.");
        return;
    }
    try {
        if (!mobileSlipSelfCheck()) throw new Error("모바일 슬립 데이터 자체 검사에 실패했습니다.");
        state.qrPages = splitMobileSlipGames(games);
        state.qrPage = 0;
        state.qrSourceLabel = sourceLabel;
        renderQrPage();
        if (typeof state.dom["qr-dialog"].showModal === "function") state.dom["qr-dialog"].showModal();
        else state.dom["qr-dialog"].setAttribute("open", "");
    } catch (error) {
        showToast(error.message || "QR을 만들지 못했습니다.");
    }
}

function closeQrDialog() {
    if (typeof state.dom["qr-dialog"].close === "function") state.dom["qr-dialog"].close();
    else state.dom["qr-dialog"].removeAttribute("open");
}

function openManualQr() {
    const parsed = parseManualGames(state.dom["manual-qr-input"].value);
    state.dom["manual-qr-errors"].innerHTML = parsed.errors
        .slice(0, 5)
        .map((message) => `<p>${escapeHtml(message)}</p>`)
        .join("");
    if (parsed.errors.length) return;
    openQrDialog(parsed.games, "직접 입력");
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

function selectedCombinations() {
    return [...state.selectedIndexes]
        .sort((left, right) => left - right)
        .map((index) => state.combinations[index])
        .filter(Boolean);
}

function currentBatchKey(
    combinations = state.combinations,
    targetRound = state.generatedRound,
    strategyNumber = state.generatedStrategy
) {
    return `${targetRound}:${strategyNumber}:${combinations.map((numbers) => numbers.join("-")).join("|")}`;
}

function updateSelectionUi() {
    const combinations = selectedCombinations();
    const count = combinations.length;
    const total = state.combinations.length;

    state.dom["selection-count"].textContent = `${count} / ${total}조합 선택`;
    state.dom["select-all-button"].disabled = count === total;
    state.dom["clear-selection-button"].disabled = count === 0;
    ["qr-button", "copy-all-button", "copy-text-button", "download-button"].forEach((id) => {
        state.dom[id].disabled = count === 0;
    });
    state.dom["qr-button"].textContent = count > 20
        ? `판매점용 QR ${Math.ceil(count / 20)}장`
        : "판매점용 QR";

}

function setAllCombinationsSelected(selected) {
    state.selectedIndexes = selected
        ? new Set(state.combinations.map((_, index) => index))
        : new Set();
    state.dom["combination-list"].querySelectorAll("[data-select-index]").forEach((checkbox) => {
        checkbox.checked = selected;
        checkbox.closest(".combination-card")?.classList.toggle("selected", selected);
    });
    updateSelectionUi();
}

function cacheDom() {
    const ids = [
        "data-chip", "data-status", "latest-round", "latest-date", "latest-balls",
        "generator-form", "strategy-select", "strategy-description", "quantity-input",
        "quantity-minus", "quantity-plus", "generate-button", "generate-button-label",
        "selected-strategy-number", "selected-strategy-name", "selected-strategy-summary",
        "results", "results-subtitle", "save-status", "qr-button", "copy-all-button", "copy-text-button", "download-button",
        "regenerate-button", "result-summary", "selection-count", "select-all-button", "clear-selection-button",
        "combination-list", "data-notice", "manual-qr-input", "manual-qr-button", "manual-qr-clear", "manual-qr-errors", "saved-history",
        "refresh-history-button", "history-summary", "current-history-title", "current-history-count",
        "current-history-list", "current-history-more", "winning-history-count", "winning-history-list", "winning-history-more",
        "saved-selection-count", "saved-select-all-button", "saved-clear-selection-button", "saved-qr-button",
        "saved-copy-all-button", "saved-copy-text-button", "saved-download-button",
        "qr-dialog", "qr-close", "qr-meta", "qr-image", "qr-page-label", "qr-page-count", "qr-game-list",
        "qr-prev", "qr-next", "qr-share", "qr-download", "qr-save-help", "document-dialog", "document-title", "document-close", "document-frame", "toast"
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
    const strategy = STRATEGIES[state.generatedStrategy];
    const targetRound = state.generatedRound;
    state.dom["results-subtitle"].textContent = `${targetRound ? `${targetRound}회 대상 · ` : ""}${state.generatedStrategy}번 ${strategy.name} · ${state.combinations.length}조합`;

    const summary = summarizeCombinations(state.combinations);
    state.dom["result-summary"].innerHTML = [
        ["사용한 번호", `${summary.uniqueCount}개 / 45개`],
        ["번호 최대 반복", `${summary.maxRepeat}회`],
        ["평균 합계", `${summary.averageSum}`],
        ["조합 간 최대 겹침", `${summary.maxPairOverlap}개`]
    ].map(([label, value]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong></div>`).join("");

    state.dom["combination-list"].innerHTML = state.combinations.map((numbers, index) => {
        const metrics = calculateMetrics(numbers);
        const selected = state.selectedIndexes.has(index);
        return `<article class="combination-card${selected ? " selected" : ""}">
            <label class="combo-select">
                <input type="checkbox" data-select-index="${index}"${selected ? " checked" : ""} aria-label="${index + 1}번 조합 선택">
                <span class="combo-index">${String(index + 1).padStart(2, "0")}</span>
            </label>
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
    if (state.dataMode === "live" && targetRound) {
        setSaveStatus(`${targetRound}회 대상 · ${state.generatedStrategy}번 전략 · 생성한 전체 조합을 자동 저장할 준비가 됐습니다.`);
    } else {
        setSaveStatus("최신 회차를 확인할 수 없어 현재 생성 기록은 자동 저장하지 않습니다.", "error");
    }
    updateSelectionUi();
    state.dom.results.classList.remove("hidden");
}

function setSaveStatus(message, status = "") {
    const statusBox = state.dom["save-status"];
    if (!statusBox) return;

    statusBox.className = `save-status${status ? ` ${status}` : ""}`;
    statusBox.textContent = message;
}

function buildSavePayload(
    combinations = state.combinations,
    strategyNumber = state.generatedStrategy,
    targetRound = state.generatedRound
) {
    const strategyName = STRATEGIES[strategyNumber].name;
    const strategyLabel = `${strategyNumber}번 ${strategyName}`;
    return combinations.map((numbers, index) => ({
        round: targetRound,
        mode: "lotto",
        numbers,
        group: "",
        grade: strategyLabel,
        strategy: strategyNumber,
        strategyName,
        sequence: index + 1,
        source: "MIX645"
    }));
}

function currentBatchIsRecorded(
    combinations = state.combinations,
    targetRound = state.generatedRound,
    strategyNumber = state.generatedStrategy
) {
    if (!combinations.length) return false;
    const strategyLabel = `${strategyNumber}번 ${STRATEGIES[strategyNumber].name}`;
    return combinations.every((numbers) => state.savedRecords.some((record) => (
        record.round === targetRound
        && record.numbers.join("-") === numbers.join("-")
        && (record.grade === strategyLabel || record.strategy === strategyNumber)
    )));
}

async function saveCurrentBatch() {
    const combinations = [...state.combinations];
    const targetRound = state.generatedRound;
    const strategyNumber = state.generatedStrategy;
    if (!combinations.length) {
        setSaveStatus("먼저 조합을 생성해 주세요.", "error");
        return false;
    }
    if (state.dataMode !== "live" || !targetRound) {
        setSaveStatus("최신 회차가 연결된 상태에서 생성한 조합만 저장할 수 있습니다.", "error");
        return false;
    }

    const batchKey = currentBatchKey(combinations, targetRound, strategyNumber);
    if (state.lastSavedKey === batchKey || currentBatchIsRecorded(combinations, targetRound, strategyNumber)) {
        state.lastSavedKey = batchKey;
        setSaveStatus(`생성한 ${combinations.length}조합은 이미 자동 저장되어 있습니다.`, "saved");
        return true;
    }

    setSaveStatus(`${targetRound}회 대상 · 생성한 ${combinations.length}조합을 자동 저장하는 중입니다.`);
    try {
        await fetch(SAVE_API_URL, {
            method: "POST",
            mode: "no-cors",
            body: JSON.stringify(buildSavePayload(combinations, strategyNumber, targetRound))
        });
        state.lastSavedKey = batchKey;
        setSaveStatus(`${targetRound}회 대상 · ${strategyNumber}번 전략 · 생성한 ${combinations.length}조합을 자동 저장했습니다.`, "saved");

        window.setTimeout(async () => {
            await loadSavedHistory({ showLoading: false });
            if (currentBatchIsRecorded(combinations, targetRound, strategyNumber)) {
                setSaveStatus(`자동 저장 확인 · ${targetRound}회 대상 · ${strategyNumber}번 전략 · ${combinations.length}조합`, "saved");
            }
        }, 1400);
        return true;
    } catch (error) {
        console.error("MIX645 save error:", error);
        setSaveStatus("생성 기록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return false;
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

function partitionSavedHistory(records, currentRound, history) {
    const activeRound = Number(currentRound) || Math.max(0, ...records.map((record) => record.round));
    const evaluated = records.map((record) => ({ record, prize: evaluatePrize(record.numbers, record.round, history) }));
    return {
        activeRound,
        evaluated,
        current: evaluated.filter(({ record }) => record.round === activeRound),
        winners: evaluated.filter(({ record, prize }) => record.round < activeRound && prize.status === "winner")
    };
}

function savedRecordSelectionKey(record) {
    return [
        record.round,
        record.timestamp,
        record.strategy,
        record.grade,
        record.numbers.join("-")
    ].join("|");
}

function currentRoundSavedRecords() {
    const activeRound = getTargetRound() || Math.max(0, ...state.savedRecords.map((record) => record.round));
    return state.savedRecords.filter((record) => record.round === activeRound);
}

function selectedSavedRecords(records = currentRoundSavedRecords()) {
    return records.filter((record) => state.selectedSavedRecordKeys.has(savedRecordSelectionKey(record)));
}

function selectedSavedCombinations() {
    return selectedSavedRecords().map((record) => record.numbers);
}

function updateSavedSelectionUi(records = currentRoundSavedRecords()) {
    const selectedCount = selectedSavedRecords(records).length;
    const total = records.length;
    state.dom["saved-selection-count"].textContent = `${selectedCount} / ${total}조합 선택`;
    state.dom["saved-select-all-button"].disabled = !total || selectedCount === total;
    state.dom["saved-clear-selection-button"].disabled = selectedCount === 0;
    ["saved-qr-button", "saved-copy-all-button", "saved-copy-text-button", "saved-download-button"].forEach((id) => {
        state.dom[id].disabled = selectedCount === 0;
    });
    state.dom["saved-qr-button"].textContent = selectedCount > 20
        ? `판매점용 QR ${Math.ceil(selectedCount / 20)}장`
        : "판매점용 QR";
}

function setAllSavedRecordsSelected(selected) {
    const records = currentRoundSavedRecords();
    state.selectedSavedRecordKeys = selected
        ? new Set(records.map(savedRecordSelectionKey))
        : new Set();
    state.dom["current-history-list"].querySelectorAll("[data-saved-select]").forEach((checkbox) => {
        checkbox.checked = selected;
        checkbox.closest(".history-card")?.classList.toggle("selected", selected);
    });
    updateSavedSelectionUi(records);
}

function historyCardMarkup({ record, prize }, selectable = false) {
    const strategyLabel = escapeHtml(strategyLabelForRecord(record));
    const detail = prize.matches === null
        ? "당첨번호 발표 전"
        : `당첨번호 ${prize.matches}개 일치${prize.bonus ? " · 보너스 일치" : ""}`;
    const selectionKey = savedRecordSelectionKey(record);
    const selected = selectable && state.selectedSavedRecordKeys.has(selectionKey);
    const selection = selectable
        ? `<label class="history-select"><input type="checkbox" data-saved-select="${escapeHtml(selectionKey)}"${selected ? " checked" : ""} aria-label="${record.round}회 저장 조합 ${record.numbers.join(", ")} 선택"><span>조합 선택</span></label>`
        : "";
    const copyButton = selectable
        ? `<button type="button" class="history-copy" data-saved-copy="${escapeHtml(selectionKey)}" aria-label="${record.round}회 저장 조합 복사">복사</button>`
        : "";
    return `<article class="history-card${prize.status === "winner" ? " is-winner" : ""}${selectable ? " selectable" : ""}${selected ? " selected" : ""}">
        ${selection}
        <div class="history-card-head">
            <div class="history-card-title">
                <strong>${record.round}회 · ${strategyLabel}</strong>
                <span>${escapeHtml(formatSavedTimestamp(record.timestamp))}</span>
            </div>
            <div class="history-card-actions"><span class="prize-badge ${prize.status}">${escapeHtml(prize.label)}</span>${copyButton}</div>
        </div>
        <div class="history-balls" aria-label="${record.round}회 저장 조합 ${record.numbers.join(", ")}">${ballsMarkup(record.numbers)}</div>
        <div class="history-card-foot"><span>${escapeHtml(detail)}</span><strong>${record.round}회 대상</strong></div>
    </article>`;
}

function renderHistoryGroup(records, listId, moreId, visibleCount, emptyMessage, selectable = false) {
    const visible = records.slice(0, visibleCount);
    state.dom[listId].innerHTML = visible.length
        ? visible.map((entry) => historyCardMarkup(entry, selectable)).join("")
        : `<p class="history-empty">${escapeHtml(emptyMessage)}</p>`;

    const moreButton = state.dom[moreId];
    moreButton.classList.toggle("hidden", visible.length >= records.length);
    moreButton.textContent = `${Math.min(HISTORY_PAGE_SIZE, records.length - visible.length)}개 더보기 · ${visible.length}/${records.length}`;
}

function renderSavedHistory() {
    const grouped = partitionSavedHistory(state.savedRecords, getTargetRound(), state.history);
    const roundLabel = grouped.activeRound ? `${grouped.activeRound}회` : "확인 중";

    state.dom["history-summary"].innerHTML = [
        ["현재 대상 회차", roundLabel],
        ["저장 조합", `${grouped.current.length}건`],
        ["이전 회차 당첨", `${grouped.winners.length}건`],
        ["확인한 기록", `${grouped.evaluated.length}건`]
    ].map(([label, value]) => `<div class="summary-item"><span>${label}</span><strong>${value}</strong></div>`).join("");

    state.dom["current-history-title"].textContent = grouped.activeRound ? `${grouped.activeRound}회 저장 기록` : "현재 회차 저장 기록";
    state.dom["current-history-count"].textContent = `${grouped.current.length}건`;
    state.dom["winning-history-count"].textContent = `${grouped.winners.length}건`;

    renderHistoryGroup(
        grouped.current,
        "current-history-list",
        "current-history-more",
        state.currentHistoryVisible,
        grouped.activeRound ? `${grouped.activeRound}회에 저장된 조합이 없습니다.` : "현재 회차를 확인하지 못했습니다.",
        true
    );
    renderHistoryGroup(
        grouped.winners,
        "winning-history-list",
        "winning-history-more",
        state.winningHistoryVisible,
        "아직 확인된 당첨 조합이 없습니다."
    );
    updateSavedSelectionUi(grouped.current.map(({ record }) => record));
}

async function loadSavedHistory({ showLoading = true } = {}) {
    const refreshButton = state.dom["refresh-history-button"];
    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = "불러오는 중...";
    }
    if (showLoading) {
        state.currentHistoryVisible = HISTORY_PAGE_SIZE;
        state.winningHistoryVisible = HISTORY_PAGE_SIZE;
        state.dom["current-history-list"].innerHTML = '<p class="history-empty">저장 기록을 불러오는 중입니다.</p>';
        state.dom["winning-history-list"].innerHTML = '<p class="history-empty">당첨 기록을 확인하는 중입니다.</p>';
    }

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
        const availableKeys = new Set(currentRoundSavedRecords().map(savedRecordSelectionKey));
        state.selectedSavedRecordKeys = new Set(
            [...state.selectedSavedRecordKeys].filter((key) => availableKeys.has(key))
        );
        renderSavedHistory();
        return state.savedRecords;
    } catch (error) {
        console.error("MIX645 history error:", error);
        state.dom["history-summary"].innerHTML = "";
        state.dom["current-history-list"].innerHTML = '<p class="history-empty">저장 기록을 불러오지 못했습니다. 조합 생성 기능은 정상적으로 이용할 수 있습니다.</p>';
        state.dom["winning-history-list"].innerHTML = '<p class="history-empty">당첨 기록을 불러오지 못했습니다.</p>';
        state.dom["current-history-more"].classList.add("hidden");
        state.dom["winning-history-more"].classList.add("hidden");
        state.selectedSavedRecordKeys.clear();
        updateSavedSelectionUi([]);
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

function generateCurrent({ scroll = true } = {}) {
    setGenerating(true);
    const strategyNumber = state.strategy;
    const quantity = state.quantity;
    window.setTimeout(() => {
        try {
            state.combinations = generateCombinations({
                strategy: strategyNumber,
                count: quantity,
                history: state.history
            });
            state.generatedStrategy = strategyNumber;
            state.generatedRound = getTargetRound();
            state.selectedIndexes = new Set(state.combinations.map((_, index) => index));
            state.lastSavedKey = "";
            renderResults();
            saveCurrentBatch();
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
    const combinations = selectedCombinations();
    if (!combinations.length) return;
    try {
        await copyText(combinationsAsTsv(combinations));
        showToast(`선택한 ${combinations.length}조합을 엑셀용 형식으로 복사했습니다.`);
    } catch {
        showToast("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
}

async function copySelectedText() {
    const combinations = selectedCombinations();
    if (!combinations.length) return;
    try {
        await copyText(combinationsAsTxt(combinations));
        showToast(`선택한 ${combinations.length}조합을 텍스트로 복사했습니다.`);
    } catch {
        showToast("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
}

function downloadCombinationsTxt(combinations, filename) {
    const blob = new Blob(["\uFEFF", combinationsAsTxt(combinations)], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
}

function downloadTxt() {
    const combinations = selectedCombinations();
    if (!combinations.length) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadCombinationsTxt(
        combinations,
        `mix645_strategy${state.generatedStrategy}_${combinations.length}_combinations_${date}.txt`
    );
    showToast(`선택한 ${combinations.length}조합을 TXT 파일로 저장했습니다.`);
}

async function copySavedAsExcel() {
    const combinations = selectedSavedCombinations();
    if (!combinations.length) return;
    try {
        await copyText(combinationsAsTsv(combinations));
        showToast(`저장 기록에서 선택한 ${combinations.length}조합을 엑셀용 형식으로 복사했습니다.`);
    } catch {
        showToast("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
}

async function copySavedAsText() {
    const combinations = selectedSavedCombinations();
    if (!combinations.length) return;
    try {
        await copyText(combinationsAsTxt(combinations));
        showToast(`저장 기록에서 선택한 ${combinations.length}조합을 텍스트로 복사했습니다.`);
    } catch {
        showToast("복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.");
    }
}

function downloadSavedTxt() {
    const combinations = selectedSavedCombinations();
    if (!combinations.length) return;
    const round = getTargetRound() || currentRoundSavedRecords()[0]?.round || "current";
    const date = new Date().toISOString().slice(0, 10);
    downloadCombinationsTxt(
        combinations,
        `mix645_round${round}_saved_${combinations.length}_combinations_${date}.txt`
    );
    showToast(`저장 기록에서 선택한 ${combinations.length}조합을 TXT 파일로 저장했습니다.`);
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
    state.dom["copy-text-button"].addEventListener("click", copySelectedText);
    state.dom["qr-button"].addEventListener("click", () => openQrDialog(selectedCombinations(), "선택 조합"));
    state.dom["download-button"].addEventListener("click", downloadTxt);
    state.dom["regenerate-button"].addEventListener("click", () => generateCurrent({ scroll: false }));
    state.dom["select-all-button"].addEventListener("click", () => setAllCombinationsSelected(true));
    state.dom["clear-selection-button"].addEventListener("click", () => setAllCombinationsSelected(false));
    state.dom["saved-select-all-button"].addEventListener("click", () => setAllSavedRecordsSelected(true));
    state.dom["saved-clear-selection-button"].addEventListener("click", () => setAllSavedRecordsSelected(false));
    state.dom["saved-qr-button"].addEventListener("click", () => openQrDialog(selectedSavedCombinations(), "저장 기록 선택"));
    state.dom["saved-copy-all-button"].addEventListener("click", copySavedAsExcel);
    state.dom["saved-copy-text-button"].addEventListener("click", copySavedAsText);
    state.dom["saved-download-button"].addEventListener("click", downloadSavedTxt);
    state.dom["manual-qr-button"].addEventListener("click", openManualQr);
    state.dom["manual-qr-clear"].addEventListener("click", () => {
        state.dom["manual-qr-input"].value = "";
        state.dom["manual-qr-errors"].innerHTML = "";
        state.dom["manual-qr-input"].focus();
    });
    state.dom["manual-qr-input"].addEventListener("input", () => {
        state.dom["manual-qr-errors"].innerHTML = "";
    });
    state.dom["refresh-history-button"].addEventListener("click", () => loadSavedHistory());
    state.dom["current-history-more"].addEventListener("click", () => {
        state.currentHistoryVisible += HISTORY_PAGE_SIZE;
        renderSavedHistory();
    });
    state.dom["winning-history-more"].addEventListener("click", () => {
        state.winningHistoryVisible += HISTORY_PAGE_SIZE;
        renderSavedHistory();
    });
    state.dom["combination-list"].addEventListener("click", async (event) => {
        const button = event.target.closest("[data-copy-index]");
        if (button) {
            const numbers = state.combinations[Number(button.dataset.copyIndex)];
            try {
                await copyText(numbers.map(formatNumber).join("\t"));
                showToast(`${Number(button.dataset.copyIndex) + 1}번 조합을 복사했습니다.`);
            } catch {
                showToast("복사하지 못했습니다.");
            }
            return;
        }

        const card = event.target.closest(".combination-card");
        if (!card || event.target.closest(".combo-select")) return;
        card.querySelector("[data-select-index]")?.click();
    });
    state.dom["combination-list"].addEventListener("change", (event) => {
        const checkbox = event.target.closest("[data-select-index]");
        if (!checkbox) return;
        const index = Number(checkbox.dataset.selectIndex);
        if (checkbox.checked) state.selectedIndexes.add(index);
        else state.selectedIndexes.delete(index);
        checkbox.closest(".combination-card")?.classList.toggle("selected", checkbox.checked);
        updateSelectionUi();
    });
    state.dom["current-history-list"].addEventListener("change", (event) => {
        const checkbox = event.target.closest("[data-saved-select]");
        if (!checkbox) return;
        const key = checkbox.dataset.savedSelect;
        if (checkbox.checked) state.selectedSavedRecordKeys.add(key);
        else state.selectedSavedRecordKeys.delete(key);
        checkbox.closest(".history-card")?.classList.toggle("selected", checkbox.checked);
        updateSavedSelectionUi();
    });
    state.dom["current-history-list"].addEventListener("click", async (event) => {
        const copyButton = event.target.closest("[data-saved-copy]");
        if (copyButton) {
            const record = currentRoundSavedRecords().find(
                (item) => savedRecordSelectionKey(item) === copyButton.dataset.savedCopy
            );
            if (!record) return;
            try {
                await copyText(record.numbers.map(formatNumber).join("\t"));
                showToast(`${record.round}회 저장 조합을 복사했습니다.`);
            } catch {
                showToast("복사하지 못했습니다.");
            }
            return;
        }

        const card = event.target.closest(".history-card.selectable");
        if (!card || event.target.closest(".history-select")) return;
        card.querySelector("[data-saved-select]")?.click();
    });
    state.dom["qr-close"].addEventListener("click", closeQrDialog);
    state.dom["qr-prev"].addEventListener("click", () => {
        state.qrPage = Math.max(0, state.qrPage - 1);
        renderQrPage();
    });
    state.dom["qr-next"].addEventListener("click", () => {
        state.qrPage = Math.min(state.qrPages.length - 1, state.qrPage + 1);
        renderQrPage();
    });
    state.dom["qr-share"].addEventListener("click", shareQrImage);
    state.dom["qr-dialog"].addEventListener("click", (event) => {
        if (event.target === state.dom["qr-dialog"]) closeQrDialog();
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
    updateQuantity(5);
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
        partitionSavedHistory,
        HISTORY_PAGE_SIZE,
        combinationsAsTsv,
        combinationsAsTxt,
        mobileSlipChecksum,
        buildMobileSlipPayload,
        splitMobileSlipGames,
        parseManualGames,
        mobileSlipSelfCheck
    };
}
