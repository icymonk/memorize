# 수학 작업 분해 (M1~M9)

> 상태: 확정 · v1.4 — [features/math.md](../features/math.md) v1.1을 개발 작업으로 나눈 것. 배경은 [proposals/math-generation.md](../proposals/math-generation.md). M1~M5는 3단계 중(3-B5 다음)에 앞당겨 하고, M6~M8은 4단계, M9는 5단계.

완료 기준(M1~M5): **단원을 골라 만든 문제집과 내가 만든 변형 문제를 다른 멤버가 풀고 바로 채점받음**

## 작업 분해
| # | 작업 | 기능 ID | 단계 |
| --- | --- | --- | --- |
| M1 | ✅ 수식 보기(KaTeX, 지문·해설·노트의 `$…$`)·수식 입력(MathLive 화면 키보드, 휴대폰). 수학 모듈 켜기, `/s/:id/math` 홈 틀. 진행: 지문·보기·정답·해설을 `MathText`로 그림(`$…$` 줄 안, `$$…$$` 따로 줄, `\$`는 글자). 문제 만들기의 지문·해설과 노트 `/수식`·`/수식 블록`에서 수식 키보드 입력. 노트 수식은 `inlineMath`·`blockMath` 노드(누르면 고침), 마크다운 내보내기는 `$…$`/`$$…$$` | MATH-01·02 | 3 |
| M2 | ✅ 문제집(`problemSets`) 만들기·목록·상세·공개 대상·편집 범위, 수학 문제(숫자 정답: 허용 오차, 분수=소수 동치 / 객관식), 교육과정 목록 원본(`shared/math/curricula/kr-2022.json`) + 자유 입력 단원. 진행: 수학 홈 문제집 목록·만들기, 문제집 상세(새 문제·문제 은행에서 넣기·빼기), 단답형 "숫자로 채점"(`tolerance`), 교육과정 초1~고1 단원·세부 개념(`m1-04` 형식). 단계별 힌트 입력은 M4에서 풀기와 함께 | MATH-10~13 | 3 |
| M3 | ✅ 문제 틀 엔진(`shared/math/`): 식 계산기(분수는 정확한 유리수, `eval` 없음, 허용 함수 `+ - * / ^ % gcd lcm abs sqrt round floor ceil min max`), seed 난수(같은 seed → 같은 숫자), 조건 다시 뽑기(최대 200번, 실패율), 지문 채우기. 변형 문제 만들기 화면·예시 5개·자주 쓰는 형식 6종. `previewTemplate`. 진행: 계산기는 mathjs 대신 자체 파서(`shared/math/expr.ts`, 의존성 없음), 틀 엔진 `shared/math/template.ts`, 형식 6종 `shared/math/presets.ts`, "변형 문제" 화면(문제집·문제 은행). 내 틀 미리보기는 같은 공용 코드로 앱에서 계산하고, 남의 틀을 미리 보는 `previewTemplate` callable은 M5(단원별 만들기)에서 만든다. 지금 시험에는 저장할 때 뽑은 예시 숫자가 나가고, 풀 때마다 새 숫자는 M4·M6 | MATH-14 | 3 |
| M4 | ✅ 풀기 `/s/:id/math/:setId/solve`: `drawProblem`(seed 기록, 완성 지문만), `checkAnswer` 변형 문제 채점, 힌트 한 단계씩(사용 기록·감점), 해설, 풀이 메모, 내 문제는 연습. 진행: callable `drawProblem`·`checkProblem`·`revealHint`(`functions/src/callable/math.ts`, 시험용 `checkAnswer`와 분리), 공용 `shared/math/solve.ts`. 풀이 기록 `problemAttempts`(서버만 씀), 틀리면 다시·맞히거나 포기하면 정답·해설, "다른 숫자로 다시"는 새 seed. 힌트 입력은 문제 만들기(`questionKeys.hints`)와 변형 문제(`template.hints`), 문제집 설정 "힌트 감점"(`hintPenalty`, 100점 만점). 풀이 메모 `problemNotes`(글 + `$…$` 수식) | MATH-20~24 | 3 |
| M5 | 단원별 만들기 `/s/:id/math/generate`: 내장 문제 틀(`shared/math/library`, 단원 code별) + 워크스페이스 공유 문제 틀(단원이 붙은 것). 미리보기에서 빼기·숫자 다시·고치기, 새/기존 문제집에 넣기. 다른 사람의 문제 틀은 정답 식이 클라이언트에 안 가도록 서버 `saveGenerated`가 복사 | MATH-15 | 3 |
| M6 | 시험으로 내기: `openTest`가 변형 문제를 시험지에 넣고, `startAttempt`가 응시자마다(또는 시험마다 하나) seed를 정해 숫자를 채움. 오답 노트 연결은 3-C 이후 | MATH-25·17·42 | 4 |
| M7 | 단원별 성취도(방사형), 작성자 통계(변형 문제는 한 문제로 합산), 도전 기록 | MATH-40·43·44 | 4 |
| M8 | 연산 훈련(문제 틀 엔진 재사용), 시간·개수 모드, 기록 | MATH-30~33 | 4 |
| M9 | AI 초안: 서버 함수에서만 호출, AI는 문제 틀만 만들고 정답은 엔진이 계산·검증, 사람·워크스페이스별 하루 한도, 키는 GitHub Secret → Secret Manager | MATH-16 | 5 |

## 원칙
- M3 엔진이 핵심이다. M5·M6·M8이 다시 쓰므로 엔진은 순수 함수로 두고 단위 테스트를 가장 많이 둔다. 앱 미리보기와 서버 채점은 같은 코드를 쓴다.
- 정답 식·조건·오답 식은 `questionKeys.template`에만 둔다. 풀이자에게는 서버가 완성한 지문·보기만 간다.
- 의존성은 M1에서 KaTeX·MathLive, M3에서 계산기(mathjs 또는 자체 파서 — M3에서 크기·보안을 보고 정함)를 추가한다.
- PR마다 단위 테스트, 규칙 테스트(새 컬렉션·필드), 로컬 E2E 흐름 하나를 붙인다.

## 변경 이력
- v1.4: M4 완료 (문제집 풀기, 힌트·감점, 해설, 풀이 메모, 풀 때마다 새 숫자)
- v1.3: M3 완료 (자체 계산기, 변형 문제 화면). `previewTemplate` callable은 M5로
- v1.2: M2 완료 (문제집, 숫자 정답, 교육과정 목록)
- v1.1: M1 완료 (KaTeX 수식 보기, MathLive 수식 입력, 노트 수식, 수학 메뉴·홈)
- v1.0: 확정 — 3-B5 다음에 M1~M5 앞당김, AI 초안은 M9
