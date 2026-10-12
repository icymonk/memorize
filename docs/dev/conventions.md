# 개발 환경 · 코드 규칙 · 테스트 · 배포 · 모니터링

> 상태: 확정 · v2.6

## 1. 개발 환경
| 항목 | 명령 / 내용 |
| --- | --- |
| 패키지 관리자 | **pnpm** (npm 금지, `package-lock.json` 만들지 않음) |
| 앱 개발 서버 | `pnpm dev` |
| 정적 빌드 | `pnpm generate` → `.output/public` |
| shadcn 컴포넌트 | `pnpm dlx shadcn-vue@latest add <name>` |
| 에뮬레이터 | `firebase emulators:start --only auth,firestore,storage,functions` (도입 예정) |
| 서버 기능 빌드 | `pnpm --filter functions build` (도입 예정, pnpm 워크스페이스에 `functions` 추가) |
| 환경 변수 | `NUXT_PUBLIC_FIREBASE_*` (`.env.example`), `NUXT_PUBLIC_USE_EMULATOR`, `NUXT_PUBLIC_SENTRY_DSN` (추가 예정) |

### 주의 (AGENTS.md와 동일)
- 사내망 SSL 검사: pnpm/npx는 `NODE_OPTIONS=--use-system-ca`, curl은 `--ssl-no-revoke`.
- `typescript`는 `^6` 고정 (TS 7 native는 JS API가 없어 Vue 도구·shadcn-vue CLI가 깨짐).
- 루트 `tsconfig.json`의 `compilerOptions.paths`(`@/*`)는 shadcn-vue CLI용이므로 지우지 않는다.
- 새 의존성: 게시 후 7일 이상 지난 버전, 범위 고정. 보안 정책 설정(`minimumReleaseAge` 등)은 우회하지 않는다.
- 패키지 관리자는 pnpm으로 통일 (`package-lock.json` 정리 필요)

### 에뮬레이터 연결
- `NUXT_PUBLIC_USE_EMULATOR=true`면 `firebase.client.ts`에서 Auth·Firestore·Storage·Functions 에뮬레이터에 연결.
- 에뮬레이터용 시드 데이터: `scripts/seed.ts` (공간 2개, 멤버 5명, 보호자·아이, 단어장·노트 샘플).

## 2. 코드 규칙
- TypeScript + `<script setup lang="ts">`.
- 이름: 컴포넌트 `PascalCase.vue`, composable `useXxx.ts`, 서비스 `services/xxx.ts`, 스토어 `stores/xxx.ts`.
- 기능 코드는 `app/features/<기능>/` ([architecture.md](./architecture.md#4-폴더-구조)). 페이지는 얇게, 기능 컴포넌트를 조합.
- `components/ui`는 shadcn-vue CLI 생성물 — 직접 수정 최소화. 앱 공통 컴포넌트는 `components/app`.
- 스타일: Tailwind 유틸리티, 클래스 합치기는 `cn()` (`app/lib/utils.ts`).
- 문서 타입: `shared/schemas`의 zod 스키마에서 타입을 뽑고, Firestore `withConverter`로 읽기·쓰기 타입을 맞춘다.
- 날짜: 저장은 `Timestamp`, 날짜 키(`YYYY-MM-DD`)는 사용자 시간대 기준 `shared/dates.ts`로만 만든다.
- 오류: 서비스에서 Firebase 오류 → 사용자 메시지 키로 바꾸고, 화면은 토스트로 표시. 예상 못 한 오류는 Sentry.
- 기능명세 ID를 코드 주석·테스트 이름에 남긴다 (예: `describe('VOC-22 쓰기 모드')`) → 명세 추적.
- 접근성: 학습 모드 키보드 조작 필수(VOC-30), 포커스 관리.
- 화면 문구는 처음부터 한 곳(`app/locales/ko.json`)에 모은다 (이후 다국어 대비).

## 3. 테스트
| 단계 | 도구 | 대상 |
| --- | --- | --- |
| 단위 | Vitest | `shared/` 전체(권한 판정, 간격 반복, 채점, 포인트·악용 방지, 날짜), 편집기 `serialize`·`diff`, 붙여넣기 파서 |
| 규칙 | `@firebase/rules-unit-testing` + 에뮬레이터 | 관계 × 컬렉션 행렬 ([security.md](./security.md#6-규칙-테스트)). `tests/rules/`(루트 lockfile과 분리된 독립 패키지), 실행 `pnpm test:rules` (Java 21, 처음 한 번 `pnpm --dir tests/rules install`). CI에서도 실행 |
| 서버 기능 | Vitest + 에뮬레이터 | callable·트리거 |
| E2E | Playwright + 에뮬레이터 | 아래 핵심 흐름 |

E2E 핵심 흐름:
1. 가입 → 내 공간 → 개인 단어장 만들기 → 낱말카드 학습 → 오늘의 복습
2. 워크스페이스 만들기 → 초대 코드 → 두 번째 사용자 참여 → 단어장 공유·학습 → 멤버 진도
3. 내 공간 단어장 → 워크스페이스로 복사
4. 노트 작성·블록 이동·새로고침 후 유지 → 편집 잠금 중 다른 사용자 읽기 전용
5. (2단계) 보호자 → 아이 계정 → 아이 로그인 코드로 로그인 → 보호자가 아이 비공개 노트 열람

## 4. Git
- 저장소: Git 초기화됨. 브랜치는 `main` ← `develop` ← 기능 브랜치.
  - `main`: 운영. `develop`에서 PR로만 합친다. 합치면 운영 배포.
  - `develop`: 개발 통합(GitHub 기본 브랜치). 기능 브랜치를 PR로 합친다. 배포는 하지 않는다.
  - 기능 브랜치 `feat/<기능>-<내용>`: `develop`에서 만들고, 리뷰 후 `develop`에 합치기.
- 커밋: Conventional Commits (`feat(vocab): …`, `fix(notes): …`).

## 5. 배포
| 대상 | 방법 |
| --- | --- |
| 미리보기 | `firebase hosting:channel:deploy <이름>` (작업 브랜치별) |
| 운영 | `pnpm generate` → `firebase deploy --only hosting,firestore:rules,firestore:indexes,storage,functions` |

- **GitHub Actions** (`.github/workflows/deploy.yml`): PR마다 미리보기 채널(7일, 주소는 PR 댓글), `main`에 머지되면 운영 배포. 수동 실행(`workflow_dispatch`)도 된다.
  - 시크릿 `FIREBASE_SERVICE_ACCOUNT`: 배포용 서비스 계정 키(JSON).
  - 변수 `NUXT_PUBLIC_FIREBASE_*`: 앱 설정(`.env.example`과 같은 이름). 빌드 때 앱에 들어가는 공개 값.
  - 운영 빌드의 `authDomain`은 `memorize-hub.web.app`(변수 `FIREBASE_PROD_AUTH_DOMAIN`으로 변경 가능). 앱과 로그인 처리 주소가 다른 사이트면 브라우저의 서드파티 저장소 차단으로 팝업 로그인이 실패한다. Google OAuth 클라이언트의 승인된 리디렉션 URI에 `https://memorize-hub.web.app/__/auth/handler`가 있어야 한다.
  - 변수 `FIREBASE_DEPLOY_ONLY`: 운영 배포 대상. 기본 `hosting,firestore`. Blaze 전환과 Storage 버킷 생성 후 `hosting,firestore,storage,functions`로 바꾼다.
  - 변수 `ENFORCE_APP_CHECK`: 서버 기능 App Check 강제 여부(기본 `false`). 비대화형 배포는 파라미터 값을 물을 수 없어 배포 직전에 `functions/.env`로 넘긴다. App Check를 켠 뒤 `true`.

- Hosting 사이트: `memorize-hub` (https://memorize-hub.web.app, `firebase.json`의 `hosting.site`). 기본 사이트 `memorize-c6c1b.web.app`은 쓰지 않는다. 로그인을 위해 Auth 승인된 도메인에 등록돼 있어야 한다.
- Firebase 프로젝트: 현재 `memorize-c6c1b` 하나(dev 겸용, `.firebaserc`의 `default`·`dev`). 운영 출시 전에 prod 프로젝트를 따로 만들어 `prod` 별칭 추가. 모두 Blaze 요금제(D1) + **예산 알림** 설정.
- 순서: 규칙·인덱스 → 서버 기능 → 앱.
- 리전: Firestore·Storage·Functions 모두 `asia-northeast3` (R6). Firestore 위치는 만든 뒤 바꿀 수 없으므로 프로젝트 생성 시 주의.

## 6. 모니터링
| 대상 | 도구 |
| --- | --- |
| 앱 오류 | Sentry `@sentry/vue` (D4). 정적 SPA이므로 `@sentry/nuxt`가 아닌 Vue SDK를 클라이언트 플러그인으로 초기화. 빌드 시 소스맵 업로드 |
| 서버 기능 오류 | Sentry Node SDK + Cloud Logging |
| 성능 | Firebase Performance Monitoring |
| 비용 | Firestore 사용량 대시보드(읽기 수, 실시간 구독 남용), 예산 알림 |

- Sentry 개인정보: 사용자 식별은 uid만, 이메일·이름·노트 내용은 보내지 않는다 (`dataCollection` 설정, `beforeSend`에서 제거). 아이 계정은 사용자 정보 전송 안 함.

## 7. 리뷰 질문
- 없음

## 8. 변경 이력
- v2.6: 운영 authDomain을 Hosting 사이트로
- v2.5: 규칙 테스트 위치·실행 방법(`tests/rules`, `pnpm test:rules`)
- v2.4: 브랜치 전략 `main` ← `develop` ← 기능 브랜치
- v2.3: Hosting 사이트를 `memorize-hub`로 지정
- v2.2: GitHub Actions 배포(미리보기·운영)와 필요한 시크릿·변수(`ENFORCE_APP_CHECK` 포함)
- v2.1: 확정 — pnpm 통일, Git 초기화, Firebase 프로젝트 `memorize-c6c1b`
- v2.0: 확정 기능명세 기준으로 새로 작성
