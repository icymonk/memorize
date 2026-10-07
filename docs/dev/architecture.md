# 아키텍처

> 상태: 확정 · v2.1

## 1. 기술 스택

| 영역 | 선택 | 상태 | 비고 |
| --- | --- | --- | --- |
| 앱 | Nuxt 5 nightly (`npm:nuxt-nightly@5x`), SPA (`ssr: false`) | 도입됨 | `nuxt generate` → Firebase Hosting 정적 배포 |
| UI | shadcn-vue + reka-ui + Tailwind v4, 아이콘 `@lucide/vue` | 도입됨 | `components/ui`는 CLI 생성물 |
| 인증 | Firebase Auth (Google, 이메일 링크, 커스텀 토큰) | 미도입 | 커스텀 토큰 = 아이 계정 (R7) |
| DB | Cloud Firestore | 도입됨(초기화만) | 서울 리전 (R6) |
| 파일 | Cloud Storage for Firebase | 도입됨(초기화만) | |
| 서버 | Cloud Functions 2nd gen, TypeScript, Node 22 | 미도입 | **0단계부터** (D1) |
| 푸시 | Firebase Cloud Messaging | 미도입 | 3단계 |
| 상태 | Pinia | 미도입 | 세션·현재 공간 등 전역 상태만 |
| DB 바인딩 | 자체 composable (R2) | 미도입 | VueFire 미사용 |
| 편집기 | Tiptap 3 (`@tiptap/vue-3`) + `@tiptap/extension-unique-id` | 미도입 | [editor.md](./editor.md) |
| 수식 | KaTeX(보기) + MathLive(입력) | 미도입 | 4단계 |
| 검증·타입 | zod | 미도입 | 앱·서버 공용 스키마 |
| 날짜 | date-fns + `@date-fns/tz` | 미도입 | 학습일지 날짜는 사용자 시간대 기준 |
| 순서 키 | fractional-indexing | 미도입 | 블록·페이지·카드 순서 |
| 오류 추적 | Sentry `@sentry/vue` | 미도입 | D4. `@sentry/nuxt`는 서버 실행을 전제로 하므로 정적 SPA에는 `@sentry/vue` 사용 |
| 성능 | Firebase Performance Monitoring | 미도입 | |
| 테스트 | Vitest, Playwright, Firebase Emulator Suite | 미도입 | [conventions.md](./conventions.md) |

> 패키지 추가 시: Nuxt 5 nightly·Vue 3.5 호환성 확인, 게시 후 7일 이상 지난 버전, 범위 고정. Nuxt 모듈이 호환되지 않으면 Vue 플러그인/composable로 직접 구성한다.

## 2. 핵심 설계: "공간(space)"

기능명세의 **워크스페이스**와 **내 공간**은 데이터상 같은 것으로 다룬다 (R1).

```
spaces/{spaceId}
  kind: 'workspace' | 'personal'
```

| | 워크스페이스 | 내 공간 |
| --- | --- | --- |
| spaceId | 자동 생성 ID | `p_{uid}` (사용자당 1개, 가입 시 서버가 생성) |
| 멤버 | 여러 명 | 본인 1명 (owner) |
| 켜진 기능 | 설정에 따름 | 단어장 + 노트·모음 + 개인 독서 + 독후감 (WS-51) |
| 포인트·랭킹·피드 | 있음 | 없음 |
| 공개 범위 | 나만/지정/그룹/전체 | 항상 나만 |

- 단어장·노트·모음·독서·독후감 화면과 저장 코드는 `spaceId`만 받으면 두 종류 모두에서 그대로 동작한다. 내 공간에서는 함께하는 요소(워크스페이스 책장, 함께 읽기, 피드백, 멤버 진도)를 숨긴다.
- **복사**(WS-60~64)는 항상 "공간 A의 콘텐츠 → 공간 B"로 처리한다. 내 공간 ↔ 워크스페이스, 워크스페이스 ↔ 워크스페이스가 같은 코드.
- **전체 오늘의 복습**(WS-53)은 내가 속한 모든 공간의 복습 대상 카드를 모아 보여준다 → [data-model.md](./data-model.md#5-외국어-학습-voc).

## 3. 시스템 구성

```
┌──────────────── 브라우저 (Nuxt SPA) ────────────────┐
│ pages → features/* 컴포넌트                          │
│   ├ stores (Pinia): auth, space, ui                 │
│   ├ composables: useDeck, usePage, useBlocks ...    │
│   ├ services: Firestore/Storage 접근 함수            │
│   └ shared/: 스키마, 권한 판정, 간격 반복, 채점        │
└───────┬──────────────┬───────────────┬──────────────┘
        │ Auth          │ Firestore      │ Storage        │ callable
        ▼               ▼ (보안 규칙)     ▼ (보안 규칙)     ▼
┌──────────────────── Firebase (서울) ──────────────────────────┐
│ Auth · Firestore · Storage · Hosting · FCM                     │
│ Cloud Functions                                                │
│  ├ callable : 초대 수락, 아이 계정, 복사, 테스트 시작·제출,       │
│  │            피드백, 책 검색 프록시 …                           │
│  ├ trigger  : 활동 기록 → 포인트·연속 학습일·미션 판정,           │
│  │            카운터, 알림, 용량 집계                            │
│  └ schedule : 리마인더, 휴지통 정리, 하루 마감(요약 고정)         │
└───────────────────────────────────────────────────────────────┘
        │ 외부: 카카오 책 검색, Google Books, Sentry
```

### 클라이언트 직접 vs 서버 기능

원칙: **조작되면 안 되는 값, 여러 문서를 원자적으로 바꾸는 일, 비밀 키가 필요한 일은 서버 기능**. 나머지는 보안 규칙으로 보호하고 클라이언트가 직접 쓴다.

| 클라이언트 직접 (규칙으로 보호) | 서버 기능 |
| --- | --- |
| 단어장·카드·노트 블록·책장·독서 기록 작성/수정 | 공간 생성, 초대 수락, 멤버 관리, 소유권 이전 |
| 개인 학습 상태 (카드 상태, 진도, 독서 위치) | 아이 계정 생성·로그인 코드·커스텀 토큰 |
| 댓글·반응 | 복사 (공간 간), 휴지통 복원 연쇄 처리 |
| 미션 제출, 체크형 완료 | 테스트 시작·제출·채점, 정답 확인 |
| 학습 세션 기록 | 피드백·승인/반려 (권한 판정 복잡) |
| | 포인트·뱃지·연속 학습일·랭킹 |
| | 활동 피드 생성, 알림·푸시 |
| | 책 검색 (API 키 보호) |
| | 업로드 용량 집계, 이상 포인트 감지 |

## 4. 폴더 구조

```
app/
  app.vue
  assets/css/
  components/
    ui/                     # shadcn-vue (CLI 생성)
    app/                    # 앱 공통: AppSidebar, SpaceSwitcher, EmptyState, FeedbackStamp …
  features/
    auth/                   # 로그인, 아이 계정 로그인
    account/                # 프로필, 설정, 보호자
    space/                  # 공간(워크스페이스·내 공간), 멤버, 그룹, 초대, 복사
    common/                 # 홈, 피드, 댓글, 피드백, 알림, 포인트, 검색, 업로드
    notes/                  # 편집기, 페이지 계층, 모음·보기, 학습일지
    vocab/
    courses/
    reading/
    reviews/                # 독후감 (notes 위에서 동작)
    missions/
    tests/
    math/
    wrong-notes/
      ├ components/
      ├ composables/
      ├ services/           # Firestore 경로·converter·쿼리 (순수 함수)
      └ types.ts
  layouts/                  # default, focus, auth
  middleware/               # auth.global, space
  pages/                    # → routing.md
  plugins/                  # firebase.client, sentry.client
  stores/                   # auth, space, ui
  lib/                      # utils(cn), firestore 헬퍼
shared/                     # 앱·서버 공용 (Firebase SDK에 의존하지 않는 순수 코드)
  schemas/                  # zod: 문서 스키마, callable 입출력
  permissions.ts            # can(...) 판정 (규칙과 같은 기준)
  srs.ts                    # 간격 반복 (R3)
  grading/                  # 문제 채점, 수식/숫자 비교
  points.ts                 # 포인트 규칙·악용 방지 계산
  dates.ts                  # 시간대·날짜 키
functions/                  # Cloud Functions (별도 package.json, shared/를 번들에 포함)
  src/
    callable/
    triggers/
    scheduled/
    lib/
firestore.rules · firestore.indexes.json · storage.rules
```

의존 방향:
- `pages → features → (common, notes, space) → services → lib/shared`
- feature끼리는 `common`, `notes`, `space`로만 의존한다 (예: `reviews → notes` OK, `notes → reviews` X).
- `shared/`는 앱·서버가 같은 판정을 하도록 하는 곳이다. 브라우저·Node 양쪽에서 돌아가야 한다.

## 5. 데이터 접근 패턴
- **services**: 경로·converter·쿼리를 캡슐화한 순수 함수 (`decksQuery(spaceId)`, `saveBlocks(...)`).
- **composables**: services + 반응형 상태 (`useDeck(spaceId, deckId)` → `{ deck, cards, pending, error }`).
- 실시간 구독(`onSnapshot`)은 필요한 곳만: 편집 중 페이지 블록, 알림 개수, 현황판, 편집 잠금. 컴포넌트 해제 시 구독 해제.
- 목록은 페이지 단위로 불러오기(`limit` + 커서).
- 오프라인: `persistentLocalCache` + `persistentMultipleTabManager`.
- 시간은 항상 `serverTimestamp()`. 학습일지 날짜 키(`YYYY-MM-DD`)만 사용자 시간대로 클라이언트가 계산하고 서버가 검증.
- 서버 기능 호출은 `httpsCallable` 래퍼 하나(`callFn(name, input)`)로 통일, 입출력은 `shared/schemas`로 검증.

## 6. 전역 상태 (Pinia)
| store | 내용 |
| --- | --- |
| `auth` | 로그인 사용자, 프로필, 보호 대상 아이 목록(`wards`), 로딩 상태 |
| `space` | 현재 spaceId, 공간 문서(설정·켜진 기능), 내 멤버십(`access`, 그룹), 내가 속한 공간 목록 |
| `ui` | 사이드바, 커맨드 팔레트, 전역 토스트 |

### 권한 판정 `useCan()`
사람 등급이 없으므로 **(내 멤버십, 공간 설정, 대상 문서)** 로 판단한다. 판정 함수는 `shared/permissions.ts`에 두고 보안 규칙 테스트와 같은 케이스로 단위 테스트한다.

```ts
can('create')            // whoCanCreate
can('host')              // whoCanHost
can('invite')            // whoCanInvite
can('edit', deck)        // createdBy / editPolicy / collaboratorIds
can('review', mission)   // hostIds / reviewerIds
can('feedback', page)    // reviewerIds / 제출된 미션의 진행자·리뷰어
can('manage')            // access ∈ owner, manager
```

## 7. 성능 · 비용
- 블록 단위 저장(D2)으로 페이지를 열 때 블록 수만큼 읽기가 발생한다 → 목록 화면은 페이지 메타만 읽고, 본문은 열 때만. 긴 페이지는 블록을 나눠 불러온다 ([editor.md](./editor.md)).
- 집계값(카드 수, 멤버 수, 진도율, 용량)은 문서에 복사해 두고 서버 기능이 갱신한다.
- 피드·랭킹은 서버가 미리 계산한 문서를 읽는다.
- 무거운 라이브러리(편집기, KaTeX, MathLive, PDF 뷰어)는 화면 단위로 나눠 불러온다.

## 8. 리뷰 질문
- 없음

## 9. 변경 이력
- v2.1: 확정 — R1(내 공간 = 멤버 1명짜리 공간), R2(VueFire 미사용), R6(서울 리전) 동의. 내 공간에 개인 독서·독후감 추가
- v2.0: 확정 기능명세 기준으로 새로 작성
