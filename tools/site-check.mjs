import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pages = ['index.html', 'about.html', 'guide1.html', 'guide2.html', 'terms.html', 'privacy.html'];
const required = [...pages, 'index.css', 'index.js', 'documents.css', 'documents.js', 'qrcode.png', 'robots.txt', 'sitemap.xml'];
const errors = [];

for (const file of required) {
    if (!existsSync(join(root, file))) errors.push(`필수 파일 없음: ${file}`);
}

function localTarget(raw) {
    const value = raw.trim();
    if (!value || value.startsWith('#') || /^(?:https?:|mailto:|tel:|data:|javascript:|about:)/i.test(value)) return null;
    return value.split('#')[0].split('?')[0];
}

for (const page of pages) {
    const path = join(root, page);
    if (!existsSync(path)) continue;
    const html = readFileSync(path, 'utf8');

    if (!/<html\s+lang="ko"/i.test(html)) errors.push(`${page}: lang="ko" 누락`);
    if (!/<meta\s+name="viewport"/i.test(html)) errors.push(`${page}: viewport 누락`);
    if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(`${page}: title 누락`);

    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length) errors.push(`${page}: 중복 id ${[...new Set(duplicates)].join(', ')}`);

    for (const match of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
        const target = localTarget(match[1]);
        if (!target) continue;
        const resolved = resolve(root, target);
        if (!resolved.startsWith(root) || !existsSync(resolved)) errors.push(`${page}: 깨진 내부 참조 ${match[1]}`);
    }
}

const index = readFileSync(join(root, 'index.html'), 'utf8');
for (const [file, title] of [
    ['about.html', '서비스 소개'],
    ['guide1.html', '로또 6/45 가이드'],
    ['guide2.html', '연금복권 720+ 가이드'],
    ['terms.html', '서비스 이용약관'],
    ['privacy.html', '개인정보처리방침']
]) {
    const escaped = file.replace('.', '\\.');
    if (!new RegExp(`openDocument\\('${escaped}'`).test(index)) errors.push(`프레임 연결 누락: ${title}`);
    if (new RegExp(`href="${escaped}"[^>]*target="_blank"`).test(index)) errors.push(`내부 문서가 새 탭으로 설정됨: ${file}`);
}

if (!index.includes('id="document-dialog"') || !index.includes('id="document-frame"')) errors.push('메인 문서 프레임 누락');
if (/myhits|fonts\.googleapis\.com/i.test(index + readFileSync(join(root, 'index.css'), 'utf8'))) errors.push('불필요한 방문자·폰트 외부 요청 잔존');

const mainCode = index + readFileSync(join(root, 'index.js'), 'utf8');
for (const phrase of ['신경망 알고리즘', '최적의 확률 구역', '당첨 가능성이 높은']) {
    if (mainCode.includes(phrase)) errors.push(`근거 없는 표현 잔존: ${phrase}`);
}

const privacy = readFileSync(join(root, 'privacy.html'), 'utf8');
for (const term of ['localStorage', '로컬 닉네임', 'GitHub Pages', 'Google Sheets', 'Google Apps Script', 'html2canvas', '카카오페이', 'azit4376@gmail.com']) {
    if (!privacy.includes(term)) errors.push(`개인정보처리방침 설명 누락: ${term}`);
}

const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
for (const page of pages.slice(1)) {
    if (!sitemap.includes(page)) errors.push(`sitemap 누락: ${page}`);
}

try {
    execFileSync(process.execPath, ['--check', join(root, 'index.js')], { stdio: 'pipe' });
    execFileSync(process.execPath, ['--check', join(root, 'documents.js')], { stdio: 'pipe' });
} catch (error) {
    errors.push(`JavaScript 문법 오류: ${error.stderr?.toString().trim() || error.message}`);
}

if (errors.length) {
    console.error(`사이트 검사 실패 (${errors.length}건)`);
    errors.forEach(error => console.error(`- ${error}`));
    process.exit(1);
}

console.log(`사이트 검사 통과: ${required.length}개 필수 파일, ${pages.length}개 페이지, 내부 링크·문서 프레임·JavaScript 확인 완료`);
