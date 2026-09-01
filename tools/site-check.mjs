import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pages = ["index.html", "about.html", "guide1.html", "terms.html", "privacy.html"];
const required = [...pages, "index.css", "index.js", "documents.css", "documents.js", "qrcode.png", "og.png", "README.md", "robots.txt", "sitemap.xml"];
const errors = [];

for (const file of required) {
    if (!existsSync(join(root, file))) errors.push(`필수 파일 없음: ${file}`);
}

function localTarget(raw) {
    const value = raw.trim();
    if (!value || value.startsWith("#") || /^(?:https?:|mailto:|tel:|data:|javascript:|about:)/i.test(value)) return null;
    return value.split("#")[0].split("?")[0];
}

for (const page of pages) {
    const path = join(root, page);
    if (!existsSync(path)) continue;
    const html = readFileSync(path, "utf8");

    if (!/<html\s+lang="ko"/i.test(html)) errors.push(`${page}: lang="ko" 누락`);
    if (!/<meta\s+name="viewport"/i.test(html)) errors.push(`${page}: viewport 누락`);
    if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(`${page}: title 누락`);

    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length) errors.push(`${page}: 중복 id ${[...new Set(duplicates)].join(", ")}`);

    for (const match of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
        const target = localTarget(match[1]);
        if (!target) continue;
        const resolved = resolve(root, target);
        if (!resolved.startsWith(root) || !existsSync(resolved)) errors.push(`${page}: 깨진 내부 참조 ${match[1]}`);
    }
}

const index = readFileSync(join(root, "index.html"), "utf8");
const mainCode = index + readFileSync(join(root, "index.js"), "utf8");

for (const [file, title] of [
    ["about.html", "서비스 소개"],
    ["guide1.html", "사용 가이드"],
    ["terms.html", "이용약관"],
    ["privacy.html", "개인정보처리방침"]
]) {
    const escaped = file.replace(".", "\\.");
    if (!new RegExp(`openDocument\\('${escaped}'`).test(index)) errors.push(`프레임 연결 누락: ${title}`);
    if (new RegExp(`href="${escaped}"[^>]*target="_blank"`).test(index)) errors.push(`내부 문서가 새 탭으로 설정됨: ${file}`);
}

for (const id of [
    "generator-form", "strategy-select", "quantity-input", "generate-button",
    "results", "save-button", "save-status", "combination-list", "saved-history",
    "history-summary", "current-history-list", "current-history-more",
    "winning-history-list", "winning-history-more", "document-dialog", "document-frame"
]) {
    if (!index.includes(`id="${id}"`)) errors.push(`메인 필수 요소 누락: ${id}`);
}

for (const phrase of ["QUANTUM", "연금복권", "고정수", "공개 타임라인", "신경망 알고리즘", "당첨 가능성이 높은"]) {
    if (mainCode.includes(phrase)) errors.push(`이전 버전 또는 과장 표현 잔존: ${phrase}`);
}

if (/myhits|fonts\.googleapis\.com|html2canvas|kakao/i.test(mainCode + readFileSync(join(root, "index.css"), "utf8"))) {
    errors.push("불필요한 외부 스크립트·추적 요청 잔존");
}

if (!index.includes('src="qrcode.png"')) errors.push("카카오페이 QR 이미지 연결 누락");
if (!index.includes('href="https://is.gd/kkcpay"') || !index.includes('aria-label="카카오페이 송금 페이지 열기"')) errors.push("카카오페이 QR 송금 링크 누락");
if (!index.includes('property="og:image" content="https://azit4376-blip.github.io/lotto/og.png')) errors.push("공유 이미지 Open Graph 연결 누락");
if (!index.includes('name="twitter:card" content="summary_large_image"')) errors.push("대형 SNS 공유 카드 설정 누락");
if (/property="og:image"[^>]+qrcode/i.test(index)) errors.push("QR 코드가 공유 이미지로 설정됨");
if (!/<h1[^>]*>MIX645 전략형 로또 조합 생성기<\/h1>/.test(index)) errors.push("MIX645 대표 제목 누락");
if (!index.includes('id="quantity-input" type="number" min="1" max="30" value="5"') || !index.includes('data-quantity="5" class="active"') || !mainCode.includes("quantity: 5")) errors.push("8번 전략·5조합 기본 설정 누락");
if (!/<meta name="keywords" content="[^"]*MIX645[^"]*mix645/.test(index)) errors.push("MIX645 대소문자 검색어 메타데이터 누락");
if (!index.includes('name="robots" content="index, follow, max-image-preview:large')) errors.push("검색로봇 색인 설정 누락");
const structuredDataText = index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
try {
    const structuredData = JSON.parse(structuredDataText || "");
    const graph = structuredData["@graph"] || [];
    if (!graph.some((item) => item["@type"] === "WebSite" && item.name === "MIX645" && item.alternateName?.includes("mix645"))) errors.push("mix645 WebSite 별칭 구조화 데이터 누락");
    if (!graph.some((item) => item["@type"] === "WebApplication" && item.name === "MIX645" && item.alternateName === "mix645")) errors.push("mix645 WebApplication 별칭 구조화 데이터 누락");
} catch {
    errors.push("JSON-LD 구조화 데이터 문법 오류");
}
if (!mainCode.includes("SAVE_API_URL") || !mainCode.includes("grade: strategyLabel")) errors.push("전략 포함 생성 기록 저장 연결 누락");
if (!mainCode.includes("HISTORY_PAGE_SIZE = 20") || !mainCode.includes("partitionSavedHistory")) errors.push("회차별 기록 분리 또는 20건 더보기 누락");
const loadHistorySection = mainCode.match(/async function loadHistory\(\)[\s\S]*?\n}\n\nfunction initialize/)?.[0] || "";
if (/generateCurrent\s*\(/.test(loadHistorySection)) errors.push("첫 접속 시 조합 자동 생성이 남아 있음");

const privacy = readFileSync(join(root, "privacy.html"), "utf8");
for (const term of ["회원가입 없음", "localStorage", "GitHub Pages", "서비스 운영 환경", "공개", "azit4376@gmail.com"]) {
    if (!privacy.includes(term)) errors.push(`개인정보처리방침 설명 누락: ${term}`);
}
for (const page of pages) {
    const content = readFileSync(join(root, page), "utf8");
    if (/스프레드시트|Google Sheets|Google Apps Script/i.test(content)) errors.push(`기술 저장 수단이 사용자 문구에 노출됨: ${page}`);
}
if (mainCode.includes("스프레드시트")) errors.push("기술 저장 수단이 화면 메시지에 노출됨: index.js");

const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
for (const page of pages.slice(1)) {
    if (!sitemap.includes(page)) errors.push(`sitemap 누락: ${page}`);
}
if (sitemap.includes("guide2.html")) errors.push("sitemap에 폐기한 연금복권 가이드 잔존");
if (!sitemap.includes("<lastmod>2026-08-30</lastmod>")) errors.push("sitemap 최신 수정일 누락");

const ogImage = readFileSync(join(root, "og.png"));
if (ogImage.length < 24 || ogImage.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    errors.push("og.png가 정상 PNG 파일이 아님");
} else {
    const width = ogImage.readUInt32BE(16);
    const height = ogImage.readUInt32BE(20);
    const ratio = width / height;
    if (width < 1200 || height < 630 || ratio < 1.85 || ratio > 1.95) errors.push(`공유 이미지 크기·비율 부적합: ${width}x${height}`);
}

try {
    execFileSync(process.execPath, ["--check", join(root, "index.js")], { stdio: "pipe" });
    execFileSync(process.execPath, ["--check", join(root, "documents.js")], { stdio: "pipe" });
} catch (error) {
    errors.push(`JavaScript 문법 오류: ${error.stderr?.toString().trim() || error.message}`);
}

try {
    const require = createRequire(import.meta.url);
    const generator = require(join(root, "index.js"));
    const history = Array.from({ length: 180 }, (_, index) => ({
        round: 180 - index,
        date: `2026-${String((index % 12) + 1).padStart(2, "0")}-01`,
        month: (index % 12) + 1,
        numbers: Array.from({ length: 6 }, (_, offset) => ((index * 11 + offset * 7) % 45) + 1).sort((a, b) => a - b),
        bonus: ((index * 13 + 5) % 45) + 1
    }));

    for (let strategy = 1; strategy <= 10; strategy += 1) {
        const combinations = generator.generateCombinations({ strategy, count: 30, history });
        if (combinations.length !== 30) throw new Error(`${strategy}번 전략 수량 오류`);
        if (new Set(combinations.map((numbers) => numbers.join("-"))).size !== 30) throw new Error(`${strategy}번 전략 중복 조합`);
        if (!combinations.every((numbers) => generator.validateCombination(numbers, { strategy, latestNumbers: history[0].numbers }))) {
            throw new Error(`${strategy}번 전략 공통 기준 위반`);
        }
        let maxOverlap = 0;
        for (let left = 0; left < combinations.length; left += 1) {
            for (let right = left + 1; right < combinations.length; right += 1) {
                maxOverlap = Math.max(maxOverlap, generator.overlapCount(combinations[left], combinations[right]));
            }
        }
        if (maxOverlap > 4) throw new Error(`${strategy}번 전략 조합 간 겹침 ${maxOverlap}개`);
        const rows = generator.combinationsAsTsv(combinations).split("\n");
        if (rows.length !== 30 || rows.some((row) => row.split("\t").length !== 6)) throw new Error(`${strategy}번 전략 복사 형식 오류`);
    }

    const winningHistory = [{ round: 100, numbers: [1, 2, 3, 4, 5, 6], bonus: 7 }];
    for (const [numbers, rank] of [
        [[1, 2, 3, 4, 5, 6], 1],
        [[1, 2, 3, 4, 5, 7], 2],
        [[1, 2, 3, 4, 5, 8], 3],
        [[1, 2, 3, 4, 8, 9], 4],
        [[1, 2, 3, 8, 9, 10], 5],
        [[1, 2, 8, 9, 10, 11], 0]
    ]) {
        if (generator.evaluatePrize(numbers, 100, winningHistory).rank !== rank) throw new Error(`${rank || "낙첨"} 판정 오류`);
    }
    const saved = generator.normalizeSavedRecord({ round: "1238", numbers: "5, 9, 10, 12, 22, 30", grade: "8번 혼합형 전략" });
    if (!saved || saved.numbers.length !== 6 || saved.round !== 1238) throw new Error("저장 기록 파싱 오류");
    const grouped = generator.partitionSavedHistory([
        generator.normalizeSavedRecord({ round: 101, numbers: "8, 12, 18, 24, 31, 42" }),
        generator.normalizeSavedRecord({ round: 100, numbers: "1, 2, 3, 4, 5, 6" }),
        generator.normalizeSavedRecord({ round: 100, numbers: "8, 12, 18, 24, 31, 42" })
    ], 101, winningHistory);
    if (grouped.current.length !== 1 || grouped.winners.length !== 1 || grouped.winners[0].prize.rank !== 1) {
        throw new Error("현재 회차 저장·이전 회차 당첨 기록 분리 오류");
    }
    if (generator.HISTORY_PAGE_SIZE !== 20) throw new Error("기록 더보기 단위 오류");
} catch (error) {
    errors.push(`생성 알고리즘 검사 실패: ${error.message}`);
}

if (errors.length) {
    console.error(`사이트 검사 실패 (${errors.length}건)`);
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
}

console.log(`사이트 검사 통과: ${required.length}개 파일, ${pages.length}개 페이지, 10개 전략 × 최대 30조합·저장·당첨 판정 확인 완료`);
