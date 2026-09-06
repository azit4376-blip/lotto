"use strict";

const RESULTS_DATA_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRlGZv0VLyDVm6SviCjdd08hZpXWXHiPzcgXAurWBqGjsOOq1CPoRr1LRBzlnR80KDVa_ECBl96pAxJ/pub?output=csv";
const RESULTS_PAGE_SIZE = 20;

const resultsState = {
    draws: [],
    filtered: [],
    page: 1,
    query: "",
    expandedRound: null,
    dom: {}
};

function parseResultsCsvLine(line) {
    return line
        .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map((cell) => cell.trim().replace(/^"|"$/g, "").replace(/""/g, "\""));
}

function parseResultsCsv(csv) {
    return String(csv || "")
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .slice(1)
        .map(parseResultsCsvLine)
        .map((cells) => {
            const prizeCells = cells.slice(9, 24);
            return {
                round: Number(String(cells[0] || "").replace(/\D/g, "")),
                date: cells[1] || "",
                numbers: cells.slice(2, 8).map(Number),
                bonus: Number(cells[8]),
                prizeAvailable: prizeCells.some((cell) => String(cell || "").trim()),
                prizes: Array.from({ length: 5 }, (_, index) => ({
                    rank: index + 1,
                    winners: parseLocalizedNumber(cells[9 + index * 3]),
                    perWinner: parseLocalizedNumber(cells[10 + index * 3]),
                    total: parseLocalizedNumber(cells[11 + index * 3])
                }))
            };
        })
        .filter((draw) => (
            draw.round > 0 &&
            draw.numbers.length === 6 &&
            draw.numbers.every((number) => number >= 1 && number <= 45) &&
            draw.bonus >= 1 && draw.bonus <= 45
        ))
        .sort((a, b) => b.round - a.round);
}

function parseLocalizedNumber(value) {
    const digits = String(value ?? "").replace(/[^\d-]/g, "");
    return digits ? Number(digits) : null;
}

function calculateDrawMetrics(draw) {
    const odd = draw.numbers.filter((number) => number % 2 === 1).length;
    const low = draw.numbers.filter((number) => number <= 22).length;
    const sum = draw.numbers.reduce((total, number) => total + number, 0);
    const consecutive = draw.numbers.reduce((count, number, index, numbers) => (
        index > 0 && number === numbers[index - 1] + 1 ? count + 1 : count
    ), 0);

    return {
        odd,
        even: 6 - odd,
        low,
        high: 6 - low,
        sum,
        consecutive
    };
}

function filterDrawsByRound(draws, query) {
    const round = Number(String(query || "").replace(/\D/g, ""));
    return round ? draws.filter((draw) => draw.round === round) : draws.slice();
}

function paginateDraws(draws, page, pageSize = RESULTS_PAGE_SIZE) {
    const totalPages = Math.max(1, Math.ceil(draws.length / pageSize));
    const safePage = Math.min(totalPages, Math.max(1, Number(page) || 1));
    const start = (safePage - 1) * pageSize;

    return {
        page: safePage,
        totalPages,
        rows: draws.slice(start, start + pageSize)
    };
}

function formatDrawDate(value) {
    const parts = String(value || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!parts) return String(value || "-");
    return `${parts[1]}. ${parts[2].padStart(2, "0")}. ${parts[3].padStart(2, "0")}.`;
}

function ballRangeClass(number) {
    return `range-${Math.min(5, Math.ceil(number / 10))}`;
}

function ballMarkup(number, bonus = false) {
    return `<span class="ball ${ballRangeClass(number)}${bonus ? " is-bonus" : ""}">${number}</span>`;
}

function formatCount(value) {
    return Number.isFinite(value) ? `${value.toLocaleString("ko-KR")}명` : "-";
}

function formatWon(value) {
    return Number.isFinite(value) ? `${value.toLocaleString("ko-KR")}원` : "-";
}

function cacheResultsDom() {
    [
        "draws-data-chip", "draws-data-status", "latest-draw-round", "latest-draw-date",
        "latest-draw-balls", "draws-metrics", "draws-summary", "round-search",
        "round-query", "round-reset", "draws-empty", "draws-table-wrap",
        "draws-table-body", "draws-pagination", "draws-prev", "draws-next", "draws-page-status"
    ].forEach((id) => {
        resultsState.dom[id] = document.getElementById(id);
    });
}

function renderLatestResult() {
    const latest = resultsState.draws[0];
    if (!latest) return;

    const metrics = calculateDrawMetrics(latest);
    resultsState.dom["latest-draw-round"].textContent = `${latest.round.toLocaleString("ko-KR")}회`;
    resultsState.dom["latest-draw-date"].textContent = formatDrawDate(latest.date);
    resultsState.dom["latest-draw-balls"].innerHTML = [
        ...latest.numbers.map((number) => ballMarkup(number)),
        '<span class="bonus-mark" aria-hidden="true">+</span>',
        `<span class="bonus-group"><small>보너스</small>${ballMarkup(latest.bonus, true)}</span>`
    ].join("");
    resultsState.dom["draws-metrics"].innerHTML = [
        ["홀짝", `${metrics.odd}:${metrics.even}`],
        ["저고", `${metrics.low}:${metrics.high}`],
        ["번호 합", metrics.sum.toLocaleString("ko-KR")],
        ["연속수", `${metrics.consecutive}쌍`]
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function drawPrizeMarkup(draw) {
    if (!draw.prizeAvailable) {
        return '<p class="draw-prize-empty">이 회차의 상세 당첨금 정보는 준비 중입니다.</p>';
    }

    const metrics = calculateDrawMetrics(draw);
    const prizeCards = draw.prizes.map((prize) => `
        <article class="draw-prize-card rank-${prize.rank}">
            <header><span>${prize.rank}</span><strong>${prize.rank}등</strong></header>
            <dl>
                <div><dt>당첨 게임</dt><dd>${formatCount(prize.winners)}</dd></div>
                <div><dt>1인당</dt><dd>${formatWon(prize.perWinner)}</dd></div>
                <div><dt>총 당첨금</dt><dd>${formatWon(prize.total)}</dd></div>
            </dl>
        </article>`).join("");

    return `
        <div class="draw-prize-heading">
            <div><span>ROUND ${draw.round}</span><h3>${draw.round.toLocaleString("ko-KR")}회 당첨금 상세</h3></div>
            <p>${formatDrawDate(draw.date)} 추첨</p>
        </div>
        <div class="draw-prize-grid">${prizeCards}</div>
        <div class="draw-detail-metrics" aria-label="${draw.round}회 번호 구성">
            <span>홀짝 <strong>${metrics.odd}:${metrics.even}</strong></span>
            <span>저고 <strong>${metrics.low}:${metrics.high}</strong></span>
            <span>번호 합 <strong>${metrics.sum.toLocaleString("ko-KR")}</strong></span>
            <span>연속수 <strong>${metrics.consecutive}쌍</strong></span>
        </div>`;
}

function drawRowMarkup(draw) {
    const isExpanded = resultsState.expandedRound === draw.round;
    const detailId = `draw-detail-${draw.round}`;
    return `
        <tr class="draw-row${isExpanded ? " is-expanded" : ""}" data-round="${draw.round}">
            <td><strong>${draw.round.toLocaleString("ko-KR")}회</strong></td>
            <td>${formatDrawDate(draw.date)}</td>
            <td><div class="draw-number-set" aria-label="${draw.round}회 당첨번호">${draw.numbers.map((number) => ballMarkup(number)).join("")}</div></td>
            <td>${ballMarkup(draw.bonus, true)}</td>
            <td><button class="draw-detail-toggle" type="button" aria-expanded="${isExpanded}" aria-controls="${detailId}">${isExpanded ? "접기" : "당첨금 보기"}</button></td>
        </tr>
        <tr class="draw-prize-row${isExpanded ? "" : " hidden"}" id="${detailId}">
            <td colspan="5"><div class="draw-prize-panel">${drawPrizeMarkup(draw)}</div></td>
        </tr>`;
}

function renderDrawArchive() {
    const pageData = paginateDraws(resultsState.filtered, resultsState.page);
    resultsState.page = pageData.page;

    const hasRows = pageData.rows.length > 0;
    resultsState.dom["draws-table-wrap"].classList.toggle("hidden", !hasRows);
    resultsState.dom["draws-empty"].classList.toggle("hidden", hasRows);
    resultsState.dom["round-reset"].classList.toggle("hidden", !resultsState.query);

    if (!hasRows) {
        resultsState.dom["draws-empty"].textContent = resultsState.query
            ? `${resultsState.query}회 당첨번호를 찾지 못했습니다.`
            : "표시할 당첨번호가 없습니다.";
    }

    resultsState.dom["draws-table-body"].innerHTML = pageData.rows.map(drawRowMarkup).join("");
    resultsState.dom["draws-summary"].textContent = resultsState.query
        ? `${resultsState.query}회 조회 결과 · ${resultsState.filtered.length}건`
        : `총 ${resultsState.draws.length.toLocaleString("ko-KR")}개 회차 · 최신 ${resultsState.draws[0].round.toLocaleString("ko-KR")}회`;

    const showPagination = hasRows && pageData.totalPages > 1;
    resultsState.dom["draws-pagination"].classList.toggle("hidden", !showPagination);
    resultsState.dom["draws-page-status"].textContent = `${pageData.page.toLocaleString("ko-KR")} / ${pageData.totalPages.toLocaleString("ko-KR")}`;
    resultsState.dom["draws-prev"].disabled = pageData.page <= 1;
    resultsState.dom["draws-next"].disabled = pageData.page >= pageData.totalPages;
}

function applyRoundSearch() {
    const digits = resultsState.dom["round-query"].value.replace(/\D/g, "");
    resultsState.dom["round-query"].value = digits;
    resultsState.query = digits;
    resultsState.filtered = filterDrawsByRound(resultsState.draws, digits);
    resultsState.page = 1;
    resultsState.expandedRound = resultsState.filtered.length === 1 ? resultsState.filtered[0].round : null;
    renderDrawArchive();
}

function toggleDrawDetail(round) {
    resultsState.expandedRound = resultsState.expandedRound === round ? null : round;
    renderDrawArchive();
    if (resultsState.expandedRound) {
        document.getElementById(`draw-detail-${round}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
}

function bindResultsEvents() {
    resultsState.dom["round-search"].addEventListener("submit", (event) => {
        event.preventDefault();
        applyRoundSearch();
    });
    resultsState.dom["round-reset"].addEventListener("click", () => {
        resultsState.dom["round-query"].value = "";
        applyRoundSearch();
        resultsState.dom["round-query"].focus();
    });
    resultsState.dom["draws-table-body"].addEventListener("click", (event) => {
        const row = event.target.closest(".draw-row");
        if (!row) return;
        toggleDrawDetail(Number(row.dataset.round));
    });
    resultsState.dom["draws-prev"].addEventListener("click", () => {
        resultsState.page -= 1;
        resultsState.expandedRound = null;
        renderDrawArchive();
        document.getElementById("draw-archive").scrollIntoView({ behavior: "smooth" });
    });
    resultsState.dom["draws-next"].addEventListener("click", () => {
        resultsState.page += 1;
        resultsState.expandedRound = null;
        renderDrawArchive();
        document.getElementById("draw-archive").scrollIntoView({ behavior: "smooth" });
    });
}

async function loadDrawResults() {
    try {
        const response = await fetch(RESULTS_DATA_URL, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const draws = parseResultsCsv(await response.text());
        if (draws.length < 20) throw new Error("회차 데이터가 충분하지 않습니다.");

        resultsState.draws = draws;
        resultsState.filtered = draws.slice();
        resultsState.dom["draws-data-status"].textContent = `최신 데이터 연결 · ${draws[0].round.toLocaleString("ko-KR")}회`;
        resultsState.dom["draws-data-chip"].classList.add("ready");
        renderLatestResult();
        renderDrawArchive();
    } catch (error) {
        console.warn("MIX645 draw archive:", error.message);
        resultsState.dom["draws-data-status"].textContent = "데이터 연결 실패";
        resultsState.dom["draws-data-chip"].classList.add("fallback");
        resultsState.dom["draws-summary"].textContent = "당첨번호를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.";
        resultsState.dom["draws-table-wrap"].classList.add("hidden");
    }
}

function initializeResults() {
    cacheResultsDom();
    bindResultsEvents();
    loadDrawResults();
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.addEventListener("DOMContentLoaded", initializeResults);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        parseResultsCsv,
        calculateDrawMetrics,
        filterDrawsByRound,
        paginateDraws,
        formatDrawDate,
        parseLocalizedNumber,
        formatCount,
        formatWon,
        drawPrizeMarkup,
        RESULTS_PAGE_SIZE
    };
}
