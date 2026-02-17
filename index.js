    const API_URLS = {
        lotto: "https://script.google.com/macros/s/AKfycbxFjCoZUcfTYRmPiWjJL3Q4_5S5Dzq8TNRPI0_73VYrRJ1QuoHryi6I4qOE-7wxbH--/exec",
        pension: "https://script.google.com/macros/s/AKfycbzzQNFIXSo7WkRpVAPkR1M-8PbpZYokVBFPlChXfK3IgCxyI2dpxj8R6cI_k5b6gXLS/exec"
    };

    // [추가] 당첨 판독 엔진
    function checkLivePrize(mode, myNums, targetRound, myGroup) {
        const winData = DB[mode].find(d => d.r === parseInt(targetRound));
        if(!winData) return { label: `${targetRound}회 대기`, class: 'badge-waiting' };

        if(mode === 'lotto') {
            const match = myNums.filter(n => winData.n.includes(n)).length;
            const bonus = myNums.includes(winData.b);
            if(match === 6) return { label: '1등 당첨!', class: 'badge-win-1' };
            if(match === 5 && bonus) return { label: '2등 당첨!', class: 'badge-win-2' };
            if(match === 5) return { label: '3등 당첨', class: 'badge-win-3' };
            if(match === 4) return { label: '4등 당첨', class: 'badge-win-4' };
            if(match === 3) return { label: '5등 당첨', class: 'badge-win-5' };
            return { label: '낙첨', class: 'badge-lose' };
        } else {
            const winStr = winData.n.join('');
            const myStr = myNums.map(n => n.toString()).join('');
            const myG = myGroup ? myGroup.toString().replace(/[^0-9]/g,'') : '';
            if(myG === winData.group && winStr === myStr) return { label: '1등 당첨!', class: 'badge-win-1' };
            let mLen = 0;
            for(let i=5; i>=0; i--) { if(winStr[i] === myStr[i]) mLen++; else break; }
            if(mLen === 6) return { label: '2등 당첨', class: 'badge-win-2' };
            if(mLen === 5) return { label: '3등 당첨', class: 'badge-win-3' };
            if(mLen === 4) return { label: '4등 당첨', class: 'badge-win-4' };
            if(mLen === 3) return { label: '5등 당첨', class: 'badge-win-5' };
            if(mLen === 2) return { label: '6등 당첨', class: 'badge-win-6' };
            if(mLen === 1) return { label: '7등 당첨', class: 'badge-win-7' };
            return { label: '낙첨', class: 'badge-lose' };
        }
    }

    const LOTTO_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRlGZv0VLyDVm6SviCjdd08hZpXWXHiPzcgXAurWBqGjsOOq1CPoRr1LRBzlnR80KDVa_ECBl96pAxJ/pub?output=csv";
    const PENSION_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRd4x0RXfEIeLkukYyrO3sU7qL4MX36JeSdfPXJjCO-Kt8bSgC6P341NC81DBTd3Yi8BS82VBvCBhte/pub?gid=0&single=true&output=csv";
    
    let currentMode = 'lotto';
    let DB = { lotto: [], pension: [] };
    let coreDB = { lotto: [], pension: [] };
    let fixes = new Set(), excs = new Set();
    let currentStatsRange = 10;
    window.sessionData = []; 

    // [추가] 페이징 관리를 위한 상태 객체
    let pageStatus = { win: 20, history: 20, store: 20 };

    window.onload = async () => { 
        log("🛰️ 퀀텀 데이터베이스 접속 중..."); 
        
        const qtySelect = document.getElementById('gen-qty');
        for (let i = 1; i <= 100; i++) {
            const opt = document.createElement('option'); opt.value = i; opt.innerText = i + " 게임"; qtySelect.appendChild(opt);
        }
        qtySelect.value = 5;

        await syncData('lotto', LOTTO_CSV_URL);
        await syncData('pension', PENSION_CSV_URL);
        updateDDay(); setInterval(updateDDay, 1000); 
        refreshUI();
    };

    function log(msg) { 
        const t = document.getElementById('term'); 
        const logLine = document.createElement('div');
        logLine.className = 'log-line';
        logLine.innerText = `> ${msg}`;
        t.appendChild(logLine);
        t.scrollTop = t.scrollHeight; 
    }

    async function pushToGlobalBatch(dataList) {
        if (!dataList || dataList.length === 0) return;
        const targetUrl = API_URLS[currentMode];
        try {
            await fetch(targetUrl, {
                method: 'POST',
                mode: 'no-cors',
                body: JSON.stringify(dataList) 
            });
            log(`🌐 [CLOUD] ${dataList.length}건 동기화 완료.`);
        } catch (e) { console.error("Cloud Sync Fail"); }
    }

    async function loadGlobalTimeline() {
            const list = document.getElementById('history-list');
            if (pageStatus.history === 20) list.innerHTML = `<div class="ai-comment">📡 실시간 분석 타임라인 동기화 중...</div>`;
            
            try {
                const res = await fetch(API_URLS[currentMode]);
                let data = await res.json();
                list.innerHTML = '';
                if (!data || data.length === 0) {
                    list.innerHTML = '<div class="ai-comment">최근 생성 기록이 없습니다.</div>';
                    return;
                }
                data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                const limitedData = data.slice(0, pageStatus.history);
                limitedData.forEach(item => {
                    const dateObj = new Date(item.timestamp);
                    const dateStr = dateObj.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\s/g, '');
                    const timeStr = dateObj.toLocaleTimeString('ko-KR', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const nums = item.numbers.split(',').map(n => n.trim().padStart(currentMode==='lotto'?2:1, '0'));
                    
                    // [수정] 당첨 판독 로직 연결
                    const prize = checkLivePrize(currentMode, nums.map(Number), item.round, item.group);

                    const card = document.createElement('div');
                    card.className = 'history-card'; 
                    card.style.cursor = 'default';
                    const ballsHTML = nums.map((num, idx) => {
                        const val = parseInt(num);
                        let colClass = (currentMode === 'lotto') ? getLottoCol(val) : `b${(idx % 6) + 1}`;
                        return `<div class="ball ${colClass}">${num}</div>`;
                    }).join('');

                    // [수정] 뱃지 두 개가 나란히 나오도록 HTML 구조 변경
                    card.innerHTML = `
                        <div class="badge">
                            <span class="badge-unit ${prize.class}">${prize.label}</span>
                            <span class="badge-unit badge-${(item.grade||'NORMAL').toLowerCase()}">${item.grade}</span>
                        </div>
                        <div style="font-size:0.75rem; font-weight:800; color:var(--gold); margin-bottom:12px; line-height:1.4;">
                            제 ${item.round}회 분석<br>
                            <span style="color:var(--dim); font-size:0.65rem;">${dateStr} ${timeStr}</span>
                        </div>
                        <div class="ball-group" style="margin-bottom:0; justify-content: center;">${ballsHTML}</div>
                    `;
                    list.appendChild(card);
                });

                addMoreButton(list, data.length, pageStatus.history, 'history');
            } catch (e) { list.innerHTML = '<div class="ai-comment">⚠️ 데이터를 로드할 수 없습니다.</div>'; }
        }

    function updateDDay() {
        const now = new Date();
        const targetDay = currentMode === 'lotto' ? 6 : 4; 
        const targetHour = currentMode === 'lotto' ? 20 : 19;
        const targetMinute = currentMode === 'lotto' ? 35 : 5;
        let tDate = new Date();
        tDate.setDate(now.getDate() + (targetDay + 7 - now.getDay()) % 7);
        tDate.setHours(targetHour, targetMinute, 0, 0); 
        if (now > tDate) tDate.setDate(tDate.getDate() + 7);
        const diff = tDate - now;
        const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
        document.getElementById('dday-display').innerText = `${currentMode==='lotto'?'로또':'연금'} 추첨까지: ${d}일 ${h}시간 ${m}분 ${s}초`;
    }

    function toggleTheme() {
        const body = document.body;
        const current = body.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        body.setAttribute('data-theme', next);
        log(`🌓 [${next.toUpperCase()}] 모드로 전환`);
    }

    async function captureCard(id) {
        const card = document.getElementById(id);
        if(!card) return;
        const wasCollapsed = card.classList.contains('collapsed');
        card.classList.remove('collapsed'); 
        log("📸 분석 이미지 생성 중...");
        try {
            const canvas = await html2canvas(card, { backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg') || '#000', scale: 3, useCORS: true });
            const imageData = canvas.toDataURL("image/png");
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (!isMobile) {
                const link = document.createElement('a');
                link.href = imageData;
                const latest = DB[currentMode][0];
                const roundNum = latest ? latest.r + 1 : '0000';
                const modeName = currentMode === 'lotto' ? 'LOTTO' : 'PENSION';
                link.download = `QUANTUM_CARD_${modeName}_R${roundNum}_CORE_SET-${id}_${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                log("✅ 개별 이미지 전문화 저장 완료");
            } else {
                const newWin = window.open("", "_blank");
                if (newWin) {
                    newWin.document.write(`<body style="margin:0; background:#000; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; color:#fff;"><p style="margin-bottom:20px; font-size:16px;">👇 이미지를 길게 눌러 <b>[사진 앱에 저장]</b> 하세요</p><img src="${imageData}" style="max-width:90%; border-radius:15px; box-shadow:0 0 30px rgba(56,189,248,0.4);" /><button onclick="window.close()" style="margin-top:30px; padding:12px 25px; background:#334155; color:#fff; border:none; border-radius:10px; font-weight:800; cursor:pointer;">닫기</button></body>`);
                }
            }
        } catch (e) { log("⚠️ 생성 실패"); console.error(e); }
        if(wasCollapsed) card.classList.add('collapsed');
    }

    async function syncData(mode, url) {
        try {
            const response = await fetch(url);
            const text = await response.text();
            let rows = text.split(/\r?\n/).filter(r => r.trim() !== '').slice(1);
            if(rows.length > 0) {
                DB[mode] = rows.map(row => {
                    const c = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim());
                    if(mode === 'lotto') return { r: parseInt(c[0]), date: c[1], n: [parseInt(c[2]),parseInt(c[3]),parseInt(c[4]),parseInt(c[5]),parseInt(c[6]),parseInt(c[7])], b: parseInt(c[8]), r1m: c[10], r2m: c[12] };
                    else return { r: parseInt(c[0]), date: c[1], group: c[2], n: [parseInt(c[3]),parseInt(c[4]),parseInt(c[5]),parseInt(c[6]),parseInt(c[7]),parseInt(c[8])] };
                }).filter(i => !isNaN(i.r)).sort((a,b) => b.r - a.r);
                coreDB[mode] = DB[mode].slice(0, 10);
                log(`✅ ${mode.toUpperCase()} 데이터 동기화 완료.`);
            }
        } catch (e) { log(`⚠️ ${mode} 동기화 실패.`); }
    }

    function switchMode(mode) {
        currentMode = mode;
        // [수정] 모드 변경 시 페이징 상태 초기화
        pageStatus = { win: 20, history: 20, store: 20 };
        document.getElementById('mode-lotto').classList.toggle('active', mode === 'lotto');
        document.getElementById('mode-pension').classList.toggle('active', mode === 'pension');
        document.getElementById('gen-qty').value = mode === 'lotto' ? 5 : 1;
        fixes.clear(); excs.clear(); renderChips(); clearList(); refreshUI();
        log(`🔄 [${mode === 'lotto' ? '로또 6/45' : '연금 720+'}] 모드로 전환`);
    }

    function refreshUI() {
        const data = DB[currentMode][0]; if(!data) return;
        document.getElementById('target-round').innerText = (data.r + 1) + "회";
        updateInfoSection();
        updateRecentWin(data); updateStats(); renderH(); renderAdvancedInsights();
    }

    function updateInfoSection() {
        const title = document.getElementById('info-title');
        const content = document.getElementById('info-content');
        if (currentMode === 'lotto') {
            title.innerHTML = "🎰 LOTTO 6/45 당첨 및 수령 안내";
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
            title.innerHTML = "🎫 PENSION 720+ 당첨 및 수령 안내";
            content.innerHTML = `
                <table class="info-table">
                    <tr><td>1등</td><td>조 + <span class="info-emphasis">6자리</span> 일치 (1등 번호 기준)</td></tr>
                    <tr><td>2~7등</td><td>각 등수별 <span class="info-emphasis">일치 조건</span> (1등 번호 기준)</td></tr>
                    <tr><td>보너스</td><td>보너스 번호 기준 <span class="info-emphasis">6자리</span> 일치</td></tr>
                    <tr><td>당첨조건</td><td>1~7등은 <span class="info-emphasis">1등 번호</span>, 보너스는 전용번호 기준</td></tr>
                    <tr><td>추첨방송</td><td>매주 <span class="info-emphasis">목요일</span> 오후 7시 05분경 (MBC)</td></tr>
                    <tr><td>추첨정보</td><td>매주 목요일 MBC 생방송 추첨 진행</td></tr>
                    <tr><td>지급기한</td><td>지급개시일로부터 <span class="info-emphasis">1년</span> (휴일 익영업일)</td></tr>
                </table>
            `;
        }
    }

    function updateRecentWin(latest) {
        document.getElementById('recent-round-label').innerText = `제 ${latest.r}회 당첨 결과`;
        document.getElementById('recent-date-label').innerText = latest.date;
        const ballsRow = document.getElementById('recent-balls-row');
        if(currentMode === 'lotto') ballsRow.innerHTML = latest.n.map(num => `<div class="ball-s ${getLottoCol(num)}">${num}</div>`).join('') + `<span style="align-self:center; font-weight:900; margin:0 5px;">+</span>` + `<div class="ball-s ${getLottoCol(latest.b)}">${latest.b}</div>`;
        else ballsRow.innerHTML = `<div class="group-tag">${latest.group}</div>` + latest.n.map((num, i) => `<div class="ball-s b${i+1}">${num}</div>`).join('');
    }

    function updateStats() {
        const currentDB = coreDB[currentMode];
        if(currentMode === 'lotto') {
            const counts = {}; currentDB.forEach(h => h.n.forEach(num => counts[num] = (counts[num] || 0) + 1));
            const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
            document.getElementById('hot-v').innerText = (sorted[0] ? sorted[0][0] : "--") + "번";
            let un = Array.from({length:45},(_,i)=>i+1).filter(n => !currentDB.some(h => h.n.includes(n)));
            document.getElementById('cold-v').innerText = (un[0] ? un[0] : "--") + "번";
        } else {
            let hotNums = [], coldNums = [];
            for(let i=0; i<6; i++) {
                const posNums = currentDB.map(h => h.n[i]);
                const counts = {}; posNums.forEach(n => counts[n] = (counts[n] || 0) + 1);
                const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
                hotNums.push(sorted[0] ? sorted[0][0] : "?");
                let unappeared = [0,1,2,3,4,5,6,7,8,9].filter(d => !posNums.includes(d));
                coldNums.push(unappeared.length > 0 ? unappeared[0] : "?");
            }
            document.getElementById('hot-v').innerText = hotNums.join(' ');
            document.getElementById('cold-v').innerText = coldNums.join(' ');
        }
    }

    function getMetrics(n) {
            if(currentMode === 'lotto') {
                const sorted = [...n].sort((a,b)=>a-b);
                const odd = n.filter(x=>x%2!==0).length;
                const low = n.filter(x=>x<=22).length;
                const sum = n.reduce((a,b)=>a+b,0);
                const ends = n.map(x=>x%10);
                let d = new Set(); for(let i=0; i<n.length; i++) for(let j=i+1; j<n.length; j++) d.add(Math.abs(n[i]-n[j]));
                const ac = d.size - 5;
                let serial = 0; for(let i=0; i<sorted.length-1; i++) if(sorted[i+1]-sorted[i]===1) serial++;
                const section = [0,0,0,0,0]; n.forEach(x => { if(x<=10) section[section.length-1]++; else if(x<=section.length-1) section[1]++; else if(x<=30) section[2]++; else if(x<=40) section[3]++; else section[4]++; });
                const primes = [2,3,5,7,11,13,17,19,23,29,31,37,41,43];
                
                // [수정] 랜덤 Math.random() 제거 -> 고정된 통계 지표로 점수 산출
                let score = 80; // 기본 점수
                if(sum >= 121 && sum <= 160) score += 7; // 로또 평균 총합 구간 가점
                if(ac >= 8) score += 5; // 복잡도 가점
                if(odd >= 2 && odd <= 4) score += 3; // 홀짝 균형 가점
                
                let grade = score >= 92 ? "LEGEND" : (score >= 85 ? "STRONG" : "NORMAL");
                return { m1: `${odd}:${6-odd}`, m2: `${low}:${6-low}`, m3: ac, m4: ends.reduce((a,b)=>a+b,0), m5: sum, m6: sorted[5]-sorted[0], m7: (sum/6).toFixed(1), m8: serial, m9: 6-new Set(ends).size, m10: section.join('-'), m11: n.filter(x=>primes.includes(x)).length, score, grade };
            } else {
                const sum = n.reduce((a,b)=>a+b,0);
                const odd = n.filter(x=>x%2!==0).length;
                const low = n.filter(x=>x<=4).length;
                let serial = 0; for(let i=0; i<n.length-1; i++) if(Math.abs(n[i+1]-n[i])===1) serial++;
                
                // [수정] 랜덤 제거
                let score = 82; 
                if(sum >= 22 && sum <= 35) score += 10;
                
                let grade = score >= 92 ? "LEGEND" : (score >= 85 ? "STRONG" : "NORMAL");
                return { p1: `Match`, p2: sum, p3: `저${low}:고${6-low}`, p4: `홀${odd}:짝${6-odd}`, p5: `${serial}-Step`, p6: n[3]+n[4]+n[5], p7: (sum/6).toFixed(1), p8: 'YES', score, grade };
            }
        }

    function addFilter(type) {
        const input = document.getElementById(type + '-in');
        input.value.split(',').forEach(v => {
            const n = parseInt(v.trim());
            const maxVal = currentMode === 'lotto' ? 45 : 9;
            if(n>=0 && n<=maxVal) { if(type === 'fix' && fixes.size < 5) fixes.add(n); else if(type === 'exc') excs.add(n); }
        });
        input.value = ''; renderChips();
    }

    function renderChips() {
        document.getElementById('fix-chips').innerHTML = Array.from(fixes).map(n => `<span class="chip chip-fix">${n} <span onclick="fixes.delete(${n});renderChips();" style="cursor:pointer">×</span></span>`).join('');
        document.getElementById('exc-chips').innerHTML = Array.from(excs).map(n => `<span class="chip chip-exc">${n} <span onclick="excs.delete(${n});renderChips();" style="cursor:pointer">×</span></span>`).join('');
    }

    function formatNums(nums) { return nums.map(n => n.toString().padStart(currentMode==='lotto'?2:1, '0')).join(' '); }

    function copyBatch(type) {
        const sk = currentMode === 'lotto' ? 'v13_db' : 'v13_pension_db';
        const data = type === 'gen' ? window.sessionData : JSON.parse(localStorage.getItem(sk) || '[]');
        if(!data.length) return;
        navigator.clipboard.writeText(data.map(i => (i.group ? i.group + " " : "") + formatNums(i.n)).join('\n'));
        alert('📋 복사 완료');
    }

    function updateBatchCopyBtn(type) {
        const sk = currentMode === 'lotto' ? 'v13_db' : 'v13_pension_db';
        const data = type === 'gen' ? window.sessionData : JSON.parse(localStorage.getItem(sk) || '[]');
        const copyBtn = document.getElementById(`batch-copy-${type}`);
        if(copyBtn) {
            copyBtn.innerText = `📋 전체 조합 복사 (${data.length}건)`;
            copyBtn.classList.toggle('hidden', !data.length);
        }
        const slipBtn = document.getElementById(`batch-slip-${type}`);
        if(slipBtn) slipBtn.classList.toggle('hidden', !data.length);
    }

    async function triggerGen() {
        const count = parseInt(document.getElementById('gen-qty').value) || 1;
        const list = document.getElementById('res-list'); list.innerHTML = ''; window.sessionData = [];
        let batchData = [];
        const latestRound = DB[currentMode][0] ? parseInt(DB[currentMode][0].r) + 1 : 0;
        log(`🎲 [${currentMode.toUpperCase()}] 분석 엔진 가동...`);
        for(let i=0; i<count; i++) {
            let n = [];
            if(currentMode === 'lotto') { while(true) { n = Array.from(fixes); while(n.length < 6) { let r = Math.floor(Math.random()*45)+1; if(!n.includes(r) && !excs.has(r)) n.push(r); } if(n.reduce((a,b)=>a+b,0) >= 100) break; } n.sort((a,b)=>a-b); }
            else { for(let j=0; j<6; j++) n.push(Math.floor(Math.random()*10)); }
            const data = { n, ...getMetrics(n), targetRound: latestRound, carryList: currentMode==='lotto'?(DB.lotto[0]?DB.lotto[0].n:[]):[], group: currentMode==='pension'?(Math.floor(Math.random()*5)+1)+"조":null };
            window.sessionData.push(data); renderCard(list, data, false);
            batchData.push({ round: latestRound, mode: currentMode, numbers: data.n, grade: data.grade });
        }
        updateBatchCopyBtn('gen');
        log(`✅ ${count}건 완료.`);
        await pushToGlobalBatch(batchData);
    }

    async function triggerGradeGen(tg) {
        const count = parseInt(document.getElementById('gen-qty').value) || 1;
        const list = document.getElementById('res-list'); list.innerHTML = ''; window.sessionData = [];
        let batchData = [];
        const latestRound = DB[currentMode][0] ? parseInt(DB[currentMode][0].r) + 1 : 0;
        log(`🎯 [${tg}] 등급 추출 개시...`);
        let f = 0, a = 0;
        while(f < count && a < 10000) {
            a++; let n = [];
            if(currentMode === 'lotto') { n = Array.from(fixes); while(n.length < 6) { let r = Math.floor(Math.random()*45)+1; if(!n.includes(r) && !excs.has(r)) n.push(r); } n.sort((a,b)=>a-b); }
            else { for(let j=0; j<6; j++) n.push(Math.floor(Math.random()*10)); }
            const m = getMetrics(n);
            if(m.grade === tg) {
                const data = { n, ...m, targetRound: latestRound, carryList: currentMode==='lotto'?(DB.lotto[0]?DB.lotto[0].n:[]):[], group: currentMode==='pension'?(Math.floor(Math.random()*5)+1)+"조":null };
                window.sessionData.push(data); renderCard(list, data, false);
                batchData.push({ round: latestRound, mode: currentMode, numbers: data.n, grade: data.grade });
                f++;
            }
        }
        updateBatchCopyBtn('gen');
        log(`✅ ${tg} 등급 추출 완료. (연산: ${a}회)`);
        await pushToGlobalBatch(batchData);
    }

    function clearList() { document.getElementById('res-list').innerHTML = ''; window.sessionData = []; updateBatchCopyBtn('gen'); log('🧹 초기화 완료.'); }
    function copyToClipboard(nums, group) { const text = (group ? group + " " : "") + formatNums(nums); navigator.clipboard.writeText(text); alert('복사 완료'); }
    function getLottoCol(n) { if(n<=10) return 'l1'; if(n<=20) return 'l2'; if(n<=30) return 'l3'; if(n<=40) return 'l4'; return 'l5'; }

    function renderCard(target, data, isH) {
            const uid = `card-${Math.random().toString(36).substr(2, 9)}`;
            const balls = data.n.map((n, i) => `<div class="ball ${currentMode==='lotto'?getLottoCol(n):'b'+(i+1)} ${(data.carryList||[]).includes(n) ? 'carry' : ''}">${n}</div>`).join('');
            const card = document.createElement('div');
            card.id = uid; card.className = isH ? 'history-card collapsed' : 'res-card collapsed';
            card.onclick = (e) => { if(!e.target.closest('button')) card.classList.toggle('collapsed'); };
            
            let mHTML = currentMode === 'lotto' ? `
                <div class="mt-box"><span class="mt-label">홀짝</span><span class="mt-val">${data.m1}</span></div>
                <div class="mt-box"><span class="mt-label">저고</span><span class="mt-val">${data.m2}</span></div>
                <div class="mt-box"><span class="mt-label">AC값</span><span class="mt-val highlight">${data.m3}</span></div>
                <div class="mt-box"><span class="mt-label">끝수합</span><span class="mt-val">${data.m4}</span></div>
                <div class="mt-box"><span class="mt-label">총합</span><span class="mt-val highlight">${data.m5}</span></div>
                <div class="mt-box"><span class="mt-label">범위</span><span class="mt-val">${data.m6}</span></div>
                <div class="mt-box"><span class="mt-label">평균</span><span class="mt-val">${data.m7}</span></div>
                <div class="mt-box"><span class="mt-label">연속</span><span class="mt-val highlight">${data.m8}</span></div>
                <div class="mt-box"><span class="mt-label">끝중복</span><span class="mt-val">${data.m9}</span></div>
                <div class="mt-box" style="grid-column: span 2;"><span class="mt-label">구간분포</span><span class="mt-val">${data.m10}</span></div>
                <div class="mt-box"><span class="mt-label">소수</span><span class="mt-val highlight">${data.m11}</span></div>
            ` : `
                <div class="mt-box"><span class="mt-label">자리 매칭</span><span class="mt-val highlight">${data.p1}</span></div>
                <div class="mt-box"><span class="mt-label">디지트 합</span><span class="mt-val highlight">${data.p2}</span></div>
                <div class="mt-box"><span class="mt-label">저고 비율</span><span class="mt-val">${data.p3}</span></div>
                <div class="mt-box"><span class="mt-label">홀짝 비율</span><span class="mt-val">${data.p4}</span></div>
                <div class="mt-box"><span class="mt-label">연속 패턴</span><span class="mt-val highlight">${data.p5}</span></div>
                <div class="mt-box"><span class="mt-label">끝3자 합</span><span class="mt-val">${data.p6}</span></div>
                <div class="mt-box"><span class="mt-label">평균값</span><span class="mt-val">${data.p7}</span></div>
                <div class="mt-box"><span class="mt-label">소수포함</span><span class="mt-val highlight">${data.p8}</span></div>
            `;

            // 등급 계산 (당첨결과 탭용)
            const metrics = getMetrics(data.n);
            const grade = data.grade || metrics.grade;
            const score = data.score || metrics.score;

            card.innerHTML = `
                <div class="badge">
                    <span class="badge-unit badge-${grade.toLowerCase()}">${grade} ${score}%</span>
                </div>
                ${isH ? `
                    <div style="text-align: left; margin-bottom: 10px;">
                        <div style="color:var(--gold); font-weight:900; font-size:1rem;">제 ${data.r}회 결과</div>
                        <div style="color:var(--dim); font-size:0.7rem; margin-top:4px;">추첨일: ${data.date}</div>
                    </div>
                    <div class="prize-row">
                        <span class="p-gold">1등: ${currentMode==='lotto'?(data.r1m||'--'):'월 700만원'}</span>
                        <span class="p-blue">2등: ${currentMode==='lotto'?(data.r2m||'--'):'월 100만원'}</span>
                    </div>` 
                : `<div class="ai-comment">AI 분석 결과 최적의 밸런스 점수 도출<br>클릭하여 상세 분석 데이터 보기</div>`}
                
                <div class="ball-group">${data.group ? `<div class="group-tag" style="background:var(--gold); padding:4px 8px; border-radius:8px; font-weight:900; color:#000; margin-right:10px;">${data.group}</div>`:''}${balls}${isH && currentMode==='lotto' && data.b ? `<span style="align-self:center; font-weight:900; margin:0 5px;">+</span><div class="ball ${getLottoCol(data.b)}">${data.b}</div>`:''}</div>
                <div class="metrics-grid">${mHTML}</div>
                ${!isH ? `<div class="card-btn-group"><button class="btn-card-action" onclick="copyToClipboard([${data.n}], '${data.group||''}')">📋 복사</button><button class="btn-card-action" onclick="captureCard('${uid}')">📸 이미지 저장</button></div>` : ''}
            `;
            target.appendChild(card);
        }

    // [추가] 공통 더보기 버튼 생성기
    function addMoreButton(container, totalLen, currentLen, type) {
        if (totalLen > currentLen) {
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
    }

    function switchTab(tab, el) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); el.classList.add('active');
        ['gen-panel', 'stats-panel', 'win-panel', 'history-panel', 'store-panel'].forEach(id => {
            const p = document.getElementById(id); if(p) p.classList.add('hidden');
        });
        document.getElementById(tab + '-panel').classList.remove('hidden');
        if(tab === 'stats') { renderHeatmap(); renderAdvancedInsights(); }
        if(tab === 'win') renderH(); 
        if(tab === 'history') loadGlobalTimeline(); 
        if(tab === 'store') renderS();
        log(`📂 [${el.innerText}] 탭으로 이동했습니다.`);
    }

    function updateStatsRange(range, el) {
        currentStatsRange = range;
        el.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active'));
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
        if (!data || data.length === 0) return;

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
        document.getElementById('insight-momentum').innerText = momentum.join(' · ');

        const overdue = domain.map(n => {
            const idx = data.findIndex(round => round.n.includes(n) || (currentMode === 'lotto' && round.b === n));
            return { n, gap: idx < 0 ? 999 : idx };
        }).sort((a, b) => b.gap - a.gap).slice(0, 5)
        .map(v => `${v.n}(${v.gap === 999 ? '기록없음' : v.gap + '회'})`);
        document.getElementById('insight-overdue').innerText = overdue.join(' · ');

        if (currentMode === 'lotto') {
            const zones = [0, 0, 0, 0, 0];
            latest10.forEach(round => {
                round.n.forEach(n => zones[Math.min(4, Math.floor((n - 1) / 10))]++);
            });
            const spread = Math.max(...zones) - Math.min(...zones);
            const balance = spread <= 4 ? '균형 우수' : (spread <= 8 ? '약간 편향' : '강한 편향');
            document.getElementById('insight-balance').innerText = `1-10:${zones[0]} / 11-20:${zones[1]} / 21-30:${zones[2]} / 31-40:${zones[3]} / 41-45:${zones[4]} (${balance})`;
        } else {
            const posInfo = Array.from({ length: 6 }, (_, pos) => {
                const unique = new Set(latest10.map(r => r.n[pos])).size;
                return `${pos + 1}열:${unique}`;
            });
            document.getElementById('insight-balance').innerText = `자리 다양성 → ${posInfo.join(' / ')}`;
        }

        const strategyText = currentMode === 'lotto'
            ? '강세 2개 + 미출현 1개 + 고정수 조합을 권장'
            : '자리별 강세숫자 3개 + 역추적 숫자 3개로 분할 추천';
        document.getElementById('insight-strategy').innerText = strategyText;

        const chips = document.getElementById('insight-strategy-chips');
        chips.innerHTML = '';
        const labels = currentMode === 'lotto'
            ? ['모멘텀 2수', '이월수 1수', '장기미출현 1수', '밸런스 2수']
            : ['강세열 우선', '자리 고정/유동 혼합', '끝수 중복 1쌍 허용', '조 번호 분산'];
        labels.forEach(txt => {
            const chip = document.createElement('div');
            chip.className = 'insight-chip';
            chip.innerText = txt;
            chips.appendChild(chip);
        });
    }

    function renderHeatmap() {
        const grid = document.getElementById('heatmap-grid');
        grid.innerHTML = '';
        const data = DB[currentMode].slice(0, currentStatsRange);
        const counts = {};
        const maxVal = currentMode === 'lotto' ? 45 : 9;
        const startVal = currentMode === 'lotto' ? 1 : 0;
        data.forEach(round => {
            round.n.forEach(num => counts[num] = (counts[num] || 0) + 1);
            if(currentMode === 'lotto' && round.b) counts[round.b] = (counts[round.b] || 0) + 1;
        });
        const values = Object.values(counts);
        const maxCount = Math.max(...(values.length ? values : [1]));
        for(let i = startVal; i <= maxVal; i++) {
            const count = counts[i] || 0;
            const ratio = count / maxCount;
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            if(count > 0) {
                cell.classList.add('active');
                cell.style.backgroundColor = `rgba(56, 189, 248, ${0.1 + (ratio * 0.6)})`;
                cell.style.borderColor = `rgba(56, 189, 248, ${0.3 + (ratio * 0.7)})`;
            }
            cell.innerHTML = `<span class="hm-num" style="color:${ratio > 0.7 ? '#fff' : 'var(--text)'}">${i}</span><span class="hm-count">${count}회</span>`;
            grid.appendChild(cell);
        }
        const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
        document.getElementById('stat-max-n').innerText = sorted[0] ? `${sorted[0][0]}번` : '--';
        const unappeared = Array.from({length: maxVal - startVal + 1}, (_, i) => i + startVal).filter(n => !counts[n]);
        document.getElementById('stat-min-n').innerText = unappeared.length > 0 ? `${unappeared[0]}번` : '--';
    }

    // [수정] 당첨결과 렌더링 (더보기 기능 포함)
    function renderH() { 
        const list = document.getElementById('win-list'); 
        list.innerHTML = ''; 
        const fullData = DB[currentMode];
        const displayData = fullData.slice(0, pageStatus.win);
        displayData.forEach(h => renderCard(list, { ...h, ...getMetrics(h.n) }, true)); 
        addMoreButton(list, fullData.length, pageStatus.win, 'win');
    }
    
    function saveData() { 
        const sk = currentMode==='lotto'?'v13_db':'v13_pension_db'; 
        if(!window.sessionData.length) return; 
        localStorage.setItem(sk, JSON.stringify([...window.sessionData, ...JSON.parse(localStorage.getItem(sk)||'[]')])); 
        alert("💾 저장소 보관 완료"); updateBatchCopyBtn('store');
    }
    
// [수정] 저장소 렌더링 (당첨 판독 + 지표 복원 + 이미지 저장 버튼 추가)
    function renderS() { 
        const sk = currentMode==='lotto'?'v13_db':'v13_pension_db'; 
        const list = document.getElementById('store-list'); 
        const batchRow = document.getElementById('store-batch-row');
        const savedData = JSON.parse(localStorage.getItem(sk)||'[]');
        list.innerHTML = ''; 
        
        if(savedData.length === 0) {
            if(batchRow) batchRow.style.display = 'none';
            list.innerHTML = '<div class="ai-comment" style="text-align:center;">📂 보관된 조합이 없습니다.</div>';
        } else {
            if(batchRow) batchRow.style.display = 'flex';
            const displayData = savedData.slice(0, pageStatus.store);
            
            displayData.forEach(item => {
                const tRound = item.targetRound || (DB[currentMode][0].r + 1);
                const prize = checkLivePrize(currentMode, item.n.map(Number), tRound, item.group);

                // 고유 ID 생성 (이미지 캡쳐용)
                const uid = `store-${Math.random().toString(36).substr(2, 9)}`;
                const balls = item.n.map((n, i) => `<div class="ball ${currentMode==='lotto'?getLottoCol(n):'b'+(i+1)}">${n}</div>`).join('');
                
                const card = document.createElement('div');
                card.id = uid;
                card.className = 'res-card collapsed';
                card.onclick = (e) => { if(!e.target.closest('button')) card.classList.toggle('collapsed'); };

                let mHTML = currentMode === 'lotto' ? `
                    <div class="mt-box"><span class="mt-label">홀짝</span><span class="mt-val">${item.m1}</span></div>
                    <div class="mt-box"><span class="mt-label">저고</span><span class="mt-val">${item.m2}</span></div>
                    <div class="mt-box"><span class="mt-label">AC값</span><span class="mt-val highlight">${item.m3}</span></div>
                    <div class="mt-box"><span class="mt-label">끝수합</span><span class="mt-val">${item.m4}</span></div>
                    <div class="mt-box"><span class="mt-label">총합</span><span class="mt-val highlight">${item.m5}</span></div>
                    <div class="mt-box"><span class="mt-label">범위</span><span class="mt-val">${item.m6}</span></div>
                    <div class="mt-box"><span class="mt-label">평균</span><span class="mt-val">${item.m7}</span></div>
                    <div class="mt-box"><span class="mt-label">연속</span><span class="mt-val highlight">${item.m8}</span></div>
                    <div class="mt-box"><span class="mt-label">끝중복</span><span class="mt-val">${item.m9}</span></div>
                    <div class="mt-box" style="grid-column: span 2;"><span class="mt-label">구간분포</span><span class="mt-val">${item.m10}</span></div>
                    <div class="mt-box"><span class="mt-label">소수</span><span class="mt-val highlight">${item.m11}</span></div>
                ` : `
                    <div class="mt-box"><span class="mt-label">자리 매칭</span><span class="mt-val highlight">${item.p1}</span></div>
                    <div class="mt-box"><span class="mt-label">디지트 합</span><span class="mt-val highlight">${item.p2}</span></div>
                    <div class="mt-box"><span class="mt-label">저고 비율</span><span class="mt-val">${item.p3}</span></div>
                    <div class="mt-box"><span class="mt-label">홀짝 비율</span><span class="mt-val">${item.p4}</span></div>
                    <div class="mt-box"><span class="mt-label">연속 패턴</span><span class="mt-val highlight">${item.p5}</span></div>
                    <div class="mt-box"><span class="mt-label">끝3자 합</span><span class="mt-val">${item.p6}</span></div>
                    <div class="mt-box"><span class="mt-label">평균값</span><span class="mt-val">${item.p7}</span></div>
                    <div class="mt-box"><span class="mt-label">소수포함</span><span class="mt-val highlight">${item.p8}</span></div>
                `;

                card.innerHTML = `
                    <div class="badge">
                        <span class="badge-unit ${prize.class}">${prize.label}</span>
                        <span class="badge-unit badge-${(item.grade||'NORMAL').toLowerCase()}">${item.grade} ${item.score}%</span>
                    </div>
                    <div style="font-size:0.75rem; font-weight:800; color:var(--gold); margin-bottom:12px;">제 ${tRound}회 분석 조합</div>
                    <div class="ball-group">${item.group ? `<div class="group-tag" style="background:var(--gold); padding:4px 8px; border-radius:8px; font-weight:900; color:#000; margin-right:10px;">${item.group}</div>`:''}${balls}</div>
                    <div class="metrics-grid">${mHTML}</div>
                    <div class="card-btn-group">
                        <button class="btn-card-action" onclick="copyToClipboard([${item.n}], '${item.group||''}')">📋 복사</button>
                        <button class="btn-card-action" onclick="captureCard('${uid}')">📸 이미지 저장</button>
                    </div>
                `;
                list.appendChild(card);
            }); 
            addMoreButton(list, savedData.length, pageStatus.store, 'store');
        }
        updateBatchCopyBtn('store'); 
    }
    
    function resetStore() { if(confirm("비우시겠습니까?")) { localStorage.removeItem(currentMode==='lotto'?'v13_db':'v13_pension_db'); renderS(); log('🗑️ 저장소를 비웠습니다.'); } }
    window.onscroll = () => { document.getElementById("btn-top").style.display = document.documentElement.scrollTop > 300 ? "flex" : "none"; };
    
    async function captureSlip(type) {
        const sk = currentMode === 'lotto' ? 'v13_db' : 'v13_pension_db';
        const data = type === 'gen' ? window.sessionData : JSON.parse(localStorage.getItem(sk) || '[]');
        if(!data.length) return;
        const now = new Date();
        const uid = Math.random().toString(36).substr(2, 9).toUpperCase();
        const fullTimeStamp = Date.now();
        let drawDate = new Date();
        const targetDay = currentMode === 'lotto' ? 6 : 4; 
        const dayDiff = (targetDay + 7 - now.getDay()) % 7;
        if (dayDiff === 0 && now.getHours() >= 20) drawDate.setDate(now.getDate() + 7);
        else drawDate.setDate(now.getDate() + dayDiff);
        const weekName = ['일', '월', '화', '수', '목', '금', '토'];
        const drawDateStr = `추첨일 : ${drawDate.getFullYear()}.${(drawDate.getMonth()+1).toString().padStart(2,'0')}.${drawDate.getDate().toString().padStart(2,'0')} (${weekName[drawDate.getDay()]})`;
        const combinedDateStr = `조합일 : ${now.getFullYear()}.${(now.getMonth()+1).toString().padStart(2,'0')}.${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
        const watermarkContainer = document.getElementById('slip-watermark');
        const wmText = currentMode === 'lotto' ? "QUANTUM LOTTO" : "QUANTUM PENSION";
        watermarkContainer.innerHTML = "";
        for(let i=0; i<60; i++) { 
            const span = document.createElement('span');
            span.className = 'watermark-text';
            span.innerText = wmText;
            watermarkContainer.appendChild(span);
        }
        const zone = document.getElementById('slip-render-zone');
        const listTarget = document.getElementById('slip-list-target');
        const slipTitle = document.getElementById('slip-title'); 
        const latest = DB[currentMode][0];
        const roundNum = latest ? latest.r + 1 : '0000'; 
        const images = [];
        slipTitle.innerText = wmText;
        document.getElementById('slip-draw-date').innerText = drawDateStr;
        document.getElementById('slip-time').innerText = combinedDateStr;
        document.getElementById('slip-trx').innerText = `TRX : QT-${uid}`;
        const totalPages = Math.ceil(data.length / 5);
        log(`📸 총 ${data.length}개 조합 분석 리포트 생성 중...`);
        for (let p = 0; p < totalPages; p++) {
            const chunk = data.slice(p * 5, (p + 1) * 5);
            document.getElementById('slip-round').innerHTML = `<span style="color:#f43f5e; font-weight:900;">[&nbsp;${p+1} &nbsp;/&nbsp; ${totalPages}&nbsp;]</span> &nbsp; 제 &nbsp; ${roundNum} &nbsp; 회`;
            document.getElementById('slip-price').innerText = `금액 ₩ ${(chunk.length * 1000).toLocaleString()}`;
            listTarget.innerHTML = chunk.map((item, i) => {
                const charIdx = String.fromCharCode(65 + i); 
                const numsHTML = item.n.map(n => `<span class="slip-num-unit">${n.toString().padStart(currentMode==='lotto'?2:1, '0')}</span>`).join('');
                const groupHTML = item.group ? `<span class="slip-group-val">${item.group}</span>` : '';
                return `
                    <div class="slip-row">
                        <span class="slip-tag">${charIdx} 조합</span>
                        ${groupHTML}
                        <div class="slip-num-container">${numsHTML}</div>
                    </div>`;
            }).join('');
            try {
                const canvas = await html2canvas(zone, { scale: 3, backgroundColor: '#fff', useCORS: true });
                images.push(canvas.toDataURL("image/png"));
            } catch(e) { log(`⚠️ ${p+1}번 슬립 생성 실패`); }
        }
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const sysName = currentMode === 'lotto' ? 'QUANTUM_LOTTO' : 'QUANTUM_PENSION';
        if (!isMobile) {
            for (let i = 0; i < images.length; i++) {
                const link = document.createElement('a');
                link.href = images[i];
                link.download = `${sysName}_R${roundNum}_P${i+1}-${uid}_${fullTimeStamp}.png`;
                document.body.appendChild(link);
                link.click();
                link.remove();
            }
            log(`✅ 분석 리포트 발행 완료 (${uid})`);
        } else {
            const newWin = window.open("", "_blank");
            if (newWin) {
                const imgTags = images.map((src, idx) => `
                    <div class="slide" style="display: ${idx === 0 ? 'flex' : 'none'}; flex-direction:column; align-items:center;">
                        <p style="margin-bottom:20px; font-size:16px; font-weight:900;">👇 [${idx+1}/${images.length}] 길게 눌러 이미지 저장</p>
                        <img src="${src}" style="max-width:95%; border-radius:5px; box-shadow:0 0 30px rgba(255,255,255,0.2);" />
                    </div>`).join('');
                newWin.document.write(`
                    <body style="margin:0; background:#000; color:#fff; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; overflow-y:auto; padding: 20px 0;">
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
                                window.scrollTo(0,0);
                            }
                        <\/script>
                    </body>`);
            }
            log(`✅ 모바일 뷰어 리포트 생성 완료 (${uid})`);
        }
    }
