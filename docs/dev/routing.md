# 화면 경로 · 레이아웃 · 접근 제어

> 상태: 확정 · v2.1

## 1. 경로 규칙
- 공간 안 화면은 모두 `/s/:spaceId/...`. 워크스페이스와 내 공간이 같은 경로·같은 화면을 쓴다 ([architecture.md](./architecture.md#2-핵심-설계-공간space)).
- `/my`는 내 공간(`/s/p_{uid}`)으로 보내는 바로가기.
- 내 공간에서는 홈·단어장·오늘의 복습·노트·모음·독서(내 책장·기록·통계)·독후감만 열린다 (WS-51). 다른 기능 경로로 들어오면 내 공간 홈으로 보낸다.

## 2. 경로 목록

### 공간 밖
| 경로 | 레이아웃 | 로그인 | 화면 | 기능 ID |
| --- | --- | :-: | --- | --- |
| `/` | default | 선택 | 비로그인: 소개 / 로그인: 공간 목록(맨 위 내 공간) | WS-41 |
| `/login` | auth | | 구글, 이메일 링크 | ACC-01·02 |
| `/login/child` | auth | | 아이 로그인 코드·QR | ACC-06 |
| `/login/finish` | auth | | 이메일 링크 완료 | ACC-02 |
| `/welcome` | auth | O | 첫 가입 설정 | ACC-04 |
| `/invite/:code` | auth | 선택 | 초대 수락 (비로그인이면 로그인 후 돌아옴) | WS-10·11 |
| `/me` | default | O | 내 정보, 통합 학습 현황, 뱃지, 이전 워크스페이스 기록 | ACC-10·30~33 |
| `/me/journal` | default | O | 모든 공간의 내 일지 모아 보기 | NOTE-39 |
| `/me/review` | focus | O | 전체 오늘의 복습 | WS-53 |
| `/settings` | default | O | 알림·리마인더·화면·학습·용량·계정 | ACC-20~24, CMN-62 |
| `/guardian` | default | O | 보호자: 아이 계정 목록, 만들기, 코드 재발급 | ACC-06~09 |
| `/guardian/:childUid` | default | O | 아이의 기록 보기 | ACC-08 |
| `/my` | — | O | `/s/p_{uid}`로 이동 | WS-50 |

### 공간 안 (`/s/:spaceId`)
| 경로 | 레이아웃 | 화면 | 기능 ID | 내 공간 |
| --- | --- | --- | --- | :-: |
| `` (홈) | default | 홈 / 내 공간 홈 | CMN-01~06, WS-54 | O |
| `/feed` | default | 활동 피드 | CMN-10~13 | |
| `/members` | default | 멤버·그룹·초대·가입 대기 | WS-20~33 | |
| `/settings` | default | 공간 설정 (멤버는 읽기 전용) | WS-01~09 | |
| `/notes` | default | 노트 홈 | NOTE-20~21 | O |
| `/notes/:pageId` | default | 페이지 (노트·모음 페이지·독후감·레슨 필기 공용) | NOTE-01~27 | O |
| `/notes/trash` | default | 휴지통 | NOTE-22 | O |
| `/collections/:collectionId` | default | 모음 보기 (리스트·캘린더·표·갤러리) | NOTE-40~49 | O |
| `/journal` | default | 내 학습일지 (캘린더) | NOTE-30~38 | |
| `/journal/:date` | default | 날짜별 일지 목록 + 새로 쓰기 | NOTE-30 | |
| `/journal/members` | default | 멤버 일지 보기 | NOTE-45 | |
| `/vocab` | default | 단어장 목록 | VOC-05 | O |
| `/vocab/new` | default | 단어장 만들기 | VOC-01·11 | O |
| `/vocab/:deckId` | default | 단어장 상세 | VOC-40~45 | O |
| `/vocab/:deckId/edit` | default | 표 편집 | VOC-13 | O |
| `/vocab/:deckId/:mode` | focus | flashcards · learn · write · match · spell · test | VOC-20~26 | O |
| `/review` | focus | 이 공간의 오늘의 복습 | VOC-44 | O |
| `/courses`, `/courses/:courseId`, `/courses/:courseId/:lessonId`, `/courses/:courseId/edit` | default | 강의자료 | CRS | |
| `/books`, `/books/add`, `/books/:bookKey`, `/books/stats` | default | 독서 (내 공간에서는 내 책장만) | READ | O |
| `/books/groups/:groupId` | default | 함께 읽기 | READ-40~45 | |
| `/reviews`, `/reviews/new` | default | 독후감 모음·새 독후감 (보기·쓰기는 `/notes/:pageId`) | REV | O |
| `/missions`, `/missions/new`, `/missions/:missionId` | default | 미션 | MIS | |
| `/tests`, `/tests/bank`, `/tests/new`, `/tests/:testId/result`, `/tests/:testId/analytics` | default | 테스트 | TST | |
| `/tests/:testId` | focus | 안내·응시 | TST-20~23 | |
| `/math`, `/math/:setId`, `/math/stats` | default | 수학 | MATH | |
| `/math/:setId/solve`, `/math/drill` | focus | 풀기·연산 훈련 | MATH-20·30 | |
| `/wrong-notes` | default | 통합 오답 노트 | WRN | |
| `/wrong-notes/retry` | focus | 다시 풀기 | WRN-20 | |

## 3. 파일 구조
```
app/pages/
  index.vue  login/index.vue  login/child.vue  login/finish.vue  welcome.vue
  invite/[code].vue
  me/index.vue  me/journal.vue  me/review.vue
  settings.vue  guardian/index.vue  guardian/[childUid].vue  my.vue
  s/[spaceId].vue                 # 공간 셸: 멤버십·설정 불러오기 + <NuxtPage/>
  s/[spaceId]/index.vue
  s/[spaceId]/notes/index.vue  s/[spaceId]/notes/[pageId].vue  s/[spaceId]/notes/trash.vue
  s/[spaceId]/collections/[collectionId].vue
  s/[spaceId]/vocab/index.vue  s/[spaceId]/vocab/new.vue
  s/[spaceId]/vocab/[deckId]/index.vue  …/edit.vue  …/[mode].vue
  …
```

## 4. 미들웨어
| 이름 | 범위 | 동작 |
| --- | --- | --- |
| `auth.global` | 전체 | 로그인 상태 확인이 끝날 때까지 대기 → 로그인 필요한 경로면 `/login?redirect=` / 첫 로그인이면 `ensureAccount` 후 `/welcome` |
| `space` | `/s/**` | 멤버 문서 확인 → 아니면 `/` + 안내. 공간 설정·내 멤버십을 store에 저장 |
| `module` (페이지 메타) | 기능 화면 | `definePageMeta({ module: 'math' })` → 꺼진 기능이면 공간 홈으로 |
| `personalAllowed` (페이지 메타) | 기능 화면 | 내 공간에서 허용되지 않은 화면이면 내 공간 홈으로 |
| `requires` (페이지 메타) | 만들기 화면 | `definePageMeta({ requires: 'create' })` → `whoCanCreate`·`whoCanHost` 불충족 시 안내 |
| `guardian` | `/guardian/**` | `wards` 클레임 확인 |

- 사람 등급으로 막는 화면은 없다. 콘텐츠별 권한(편집, 현황판 등)은 화면 안에서 `useCan()`으로 판단해 보여주는 것만 바꾼다.

## 5. 레이아웃
| 레이아웃 | 구성 |
| --- | --- |
| `default` | 왼쪽 사이드바(맨 위 내 공간, 공간 전환, 기능 메뉴, 노트 계층), 위쪽 막대(검색 `Ctrl+K`, 알림, 내 정보). 모바일은 아래 탭 + 아래에서 올라오는 창 |
| `focus` | 학습·응시·풀기용 전체 화면. 나가기, 진행률만 |
| `auth` | 가운데 카드 |

## 6. 정적 배포 주의
- `ssr: false` + `nuxt generate`. 동적 경로는 클라이언트에서 처리 → `firebase.json` Hosting `rewrites: ** → /index.html` (이미 설정됨).
- 초대 링크 미리보기(OG 태그)가 필요하면 이후 서버 기능으로 별도 처리.

## 7. 변경 이력
- v2.1: 확정 — 내 공간에서 독서·독후감 경로 허용
- v2.0: 확정 기능명세 기준으로 새로 작성
