# MIX645

전략 번호와 조합 수만 선택하는 정적 로또 6/45 조합 생성기입니다. 기본값은 `8번 혼합형 · 15조합`이며 회원가입과 닉네임 입력 없이 사용할 수 있습니다.

## 주요 기능

- 1~10번 번호 선택 전략
- 1~30조합 생성
- 홀짝, 저고, 합계, 구간, 끝수, 연속수 자동 검증
- 최근 당첨번호 과다 중복 및 생성 조합 간 과다 겹침 제한
- 엑셀용 전체 복사와 TXT 다운로드
- 대상 회차·전략·조합을 기존 Google Apps Script 스프레드시트에 저장
- 저장 조합을 당첨번호와 대조해 1~5등·낙첨·결과 대기 표시
- 선택형 카카오페이 QR 후원 영역
- 서비스 소개, 사용 가이드, 이용약관, 개인정보처리방침을 메인 화면 프레임에서 열기
- 외부 회차 데이터 연결 실패 시 일반 균형 모드로 계속 동작

## 파일 구성

GitHub Pages 저장소의 `lotto` 사이트 루트에 아래 파일과 `tools` 폴더를 그대로 올립니다.

```text
index.html
index.css
index.js
about.html
guide1.html
terms.html
privacy.html
documents.css
documents.js
qrcode.png
robots.txt
sitemap.xml
tools/site-check.mjs
```

## 로컬 실행

사이트 폴더에서 정적 서버를 실행합니다.

```text
python -m http.server 4180
```

브라우저에서 `http://127.0.0.1:4180/`을 엽니다. `file://`로 직접 열면 브라우저 보안 정책 때문에 Google Sheets CSV 요청이 실패할 수 있습니다.

## 배포 전 검사

Node.js가 설치된 환경에서 다음 명령을 실행합니다.

```text
node tools/site-check.mjs
```

필수 파일, 내부 링크, 중복 ID, 문서 프레임, JavaScript 문법, 당첨 등수 판정과 10개 전략의 최대 30조합 생성을 검사합니다.

## 데이터와 개인정보

- 과거 회차 데이터: 게시된 Google Sheets 공개 CSV
- 생성 기록: 기존 Google Apps Script 공개 스프레드시트
- 사이트 호스팅: GitHub Pages
- 생성 위치: 이용자 브라우저
- 자체 쿠키·localStorage·분석 추적기: 사용하지 않음
- 저장 항목: 저장 시각, 대상 회차, 생성 번호, 사용 전략

Google Sheets를 불러오지 못하면 생성기는 일반 균형 기준으로 자동 전환합니다. 공식 당첨 결과와 복권 규정은 동행복권을 최종 기준으로 확인해야 합니다.

## 안내

로또는 무작위 추첨이므로 당첨을 보장하지 않습니다. 생성 조합은 통계와 조합 균형을 참고한 재미·전략용 정보입니다.
