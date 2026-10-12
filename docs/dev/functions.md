# 서버 기능 (Cloud Functions)

> 상태: 확정 · v2.4 — 결정 D1: 0단계부터 사용

## 1. 공통 규칙
| 항목 | 내용 |
| --- | --- |
| 런타임 | Cloud Functions 2nd gen, Node 22, TypeScript |
| 리전 | `asia-northeast3` (서울, R6) |
| 위치 | `functions/` 별도 패키지. `shared/`(스키마·권한·채점·포인트)를 번들에 포함 |
| 호출 | callable(`onCall`)은 로그인 필수(아이 로그인 제외), App Check 필수. 앱은 Hosting rewrite `/fn/{이름}`으로 같은 주소에서 호출한다(`cloudfunctions.net`을 막는 네트워크 대응). **callable을 추가하면 `firebase.json`에 rewrite도 추가** — `functions/src/rewrites.test.ts`가 검사. Hosting 경유 요청은 60초 제한 |
| 입력 검증 | 모든 callable 입력·출력을 `shared/schemas`의 zod 스키마로 검증 |
| 권한 | 서버도 `shared/permissions.ts`로 같은 판정을 한다 (규칙을 우회하므로 반드시 직접 검사) |
| 멱등성 | 트리거는 재시도될 수 있다 → 이벤트 ID로 처리 기록(`_processed/{eventId}`)을 남겨 중복 방지. 포인트 적립은 원장(`pointLedger`) 기준 |
| 오류 | `HttpsError` 코드 + 사용자용 메시지 키. 예상 못 한 오류는 Sentry(Node SDK)로 |
| 비밀 값 | 카카오·Google Books 키는 Secret Manager (`defineSecret`) |

이름 규칙: callable은 동사로 시작(`joinSpace`), 트리거는 `on{대상}{동작}`(`onStudySessionCreated`), 스케줄은 `cron{일}`(`cronDailyClose`).

## 2. callable 목록

### 계정 (ACC)
| 이름 | 하는 일 | 기능 ID | 단계 |
| --- | --- | --- | --- |
| `ensureAccount` | 첫 로그인 후 호출. `users/{uid}`·내 공간(`p_{uid}`) 생성. 이미 있으면 아무것도 안 함 | ACC-04, WS-50 | 0 |
| `createChildAccount` | 보호자가 아이 계정 생성 (Auth 사용자 + `users` + 내 공간) → 로그인 코드 발급, 보호자 클레임 갱신 | ACC-06·07 | 2 |
| `issueChildLoginCode` | 로그인 코드/QR 재발급, 이전 코드 폐기 | ACC-08 | 2 |
| `childSignIn` | **로그인 없이 호출**. 코드 확인 → 커스텀 토큰 반환 (R7). IP·코드별 시도 제한 | ACC-06 | 2 |
| `inviteGuardian` / `acceptGuardianInvite` | 보호자 추가 | ACC-09 | 2 |
| `convertChildAccount` | 만 14세 이후 일반 계정으로 전환 (이메일 연결) | ACC 예외 | 3 |
| `exportMyData` | 내 노트·일지·독후감·단어장을 파일로 묶어 Storage 임시 링크 | ACC-40 | 3 |
| `deleteAccount` | 탈퇴: 소유 워크스페이스 확인, 개인 데이터 삭제, 공유 콘텐츠는 기본 남김 | ACC-41 | 3 |

### 공간 · 멤버 (WS)
| 이름 | 하는 일 | 기능 ID | 단계 |
| --- | --- | --- | --- |
| `createWorkspace` | 공간 + 소유자 멤버 문서 + 기본 과목·스탬프·템플릿 생성 | WS-01 | 0 |
| `createInvite` | 초대 링크·코드 생성("초대 가능자" 확인). 6자리 코드를 모든 공간에서 유일하게 발급 (`invites` 컬렉션 그룹 `code` 필드로 중복 확인) | WS-10·11 | 0 |
| `getInvite` | 초대 화면 미리보기. 멤버가 아니어도 공간 이름·아이콘·소개·멤버 수와 상태(사용 가능/이미 멤버/대기/사용 불가/가득 참)만 반환 | WS-10·11 | 0 |
| `joinSpace` | 초대 코드/링크 확인(만료·횟수·인원) → 멤버 생성 또는 승인 대기 | WS-10·11·13 | 0 |
| `sendEmailInvite` | 이메일 초대 기록(`emailInvites`) 생성 → 초대 메일 발송 (방식은 아래 2-1). 해당 이메일로 로그인하면 `joinSpace`가 기록을 찾아 바로 가입 | WS-12 | 2 |
| `decideJoinRequest` | 가입 승인/거절 | WS-13 | 0 (가입 방식 설정 WS-03과 함께) |
| `setManager` / `removeMember` / `leaveSpace` | 운영 권한 변경, 내보내기, 나가기 (노트 `ownerStatus` 갱신) | WS-22~24 | 0 |
| `transferOwnership` / `respondOwnership` | 소유권 넘기기 요청(`uid: null`이면 취소) / 받는 사람의 수락·거절. 수락 시 이전 소유자는 매니저 | WS-25 | 0 |
| `scheduleSpaceDeletion` / `cancelSpaceDeletion` | 7일 유예 삭제 | WS-07 | 0 |
| `restoreGroup` | 삭제된 그룹 복원 (30일) | WS-33 | 2 |
| `copyContent` | 공간 A → 공간 B 복사 (단어장, 페이지·하위 페이지, 모음, 문제·묶음, 문제집, 코스, 템플릿). 권한·조건 검사, 볼 수 없는 연결 제거, 파일 복사 | WS-60~64 | 1 (단어장·노트), 3 (나머지) |

#### 2-1. 초대 메일 발송 방식 (Firebase·무료 서비스 우선)
| 순위 | 방식 | 비용 | 한계 |
| --- | --- | --- | --- |
| 1 (기본) | **Firebase Auth 이메일 링크 로그인 메일**을 초대 메일로 사용. 초대하는 사람의 앱이 `sendSignInLinkToEmail(초대받는 이메일, { url: /invite/{code}?email=… })` 호출 → 받은 사람이 링크를 누르면 로그인과 동시에 초대 화면으로 | 무료 (Firebase Auth 포함) | 메일 문구가 "로그인 링크" 형식으로 거의 고정 → 초대한 사람·워크스페이스 이름을 메일에 넣기 어렵다. Auth의 하루 메일 발송 한도 적용 |
| 2 (필요 시) | Firebase **Trigger Email** 확장 + 무료 SMTP (예: Brevo 무료 등급, Gmail SMTP) | 무료 등급 안에서 무료 | 하루 발송량 제한, SMTP 계정 관리 필요. 대신 초대 문구를 자유롭게 작성 |

- 1번으로 시작하고, 초대 문구를 꾸며야 할 필요가 생기면 2번으로 바꾼다. 둘 다 `sendEmailInvite`가 `emailInvites` 기록을 먼저 만드는 구조는 같다.

### 공통 (CMN)
| 이름 | 하는 일 | 기능 ID | 단계 |
| --- | --- | --- | --- |
| `requestFeedback` | 피드백 요청: 대상 글의 `reviewerIds`·`sharedWith` 추가 + 요청 문서 + 알림 | CMN-23 | 2 |
| `giveFeedback` | 피드백 권한 검사 후 `comments(kind:'feedback')` 작성, 요청 완료 처리 | CMN-24·25 | 2 |
| `adjustPoints` | 소유자·매니저의 포인트 조정·회수 (원장 기록, 알림) | CMN-77 | 4 |
| `searchAll` | 통합 검색 (초기: 제목·태그 쿼리 합치기) | CMN-50 | 3 |

### 노트 (NOTE)
| 이름 | 하는 일 | 기능 ID | 단계 |
| --- | --- | --- | --- |
| `trashPage` / `restorePage` | 하위 페이지 포함 휴지통 이동·복원 | NOTE-22 | 1 |
| `restoreVersion` | 버전 스냅샷으로 되돌리기 | NOTE-63 | 3 |
| `submitToMission` | 노트·독후감을 미션에 제출: 제출 문서 + `sharedWith`·`reviewerIds`·`missionIds` 갱신 | MIS-22, NOTE-53 | 2 |

### 독서 (READ)
| 이름 | 하는 일 | 기능 ID | 단계 |
| --- | --- | --- | --- |
| `searchBooks` | 카카오 책 검색 → 결과 없거나 부족하면 Google Books (D3). 결과를 정규화해 `bookKey` 포함 반환. 결과 캐시(24시간) | READ-01 | 2 |

### 미션 (MIS)
| 이름 | 하는 일 | 기능 ID | 단계 |
| --- | --- | --- | --- |
| `joinActivity` / `leaveActivity` | 열린 미션·함께 읽기 참여/그만두기 | MIS-21·24, READ-41 | 2 |
| `reviewSubmission` | 승인/반려 (본인 제출 승인 금지, 진행자·리뷰어·동료 검토자만) | MIS-31·32 | 2 |
| `cheerParticipants` | 미완료 참여자에게 응원 알림 (하루 횟수 제한) | MIS-33 | 4 |

### 테스트 · 수학 (TST · MATH)
| 이름 | 하는 일 | 기능 ID | 단계 |
| --- | --- | --- | --- |
| `startAttempt` | 대상·기간·횟수 확인 → 응시 문서(마감 시각 서버 계산, 섞인 순서) 생성. 진행자·출제자면 연습 응시 | TST-20·21 | 3 |
| `submitAttempt` | 마감 확인 → 정답으로 채점 → 결과 저장 → 공개 설정에 따라 해설 포함 응답. 시간이 지난 응시는 자동 제출 | TST-23·30·32 | 3 |
| `checkAnswer` | 연습 모드·수학 문제집의 문항별 즉시 채점 | TST-17, MATH-20 | 3 |
| `getGradingKit` / `gradeManual` / `regrade` | 서술형 채점 자료 제공, 직접 채점, 다시 채점 | TST-31 | 3 |
| `resolveAppeal` | 이의 신청 인정 → 정답 추가·재채점 | MATH 예외 | 4 |

## 3. 트리거 목록

### 활동 · 포인트 흐름
```
원본 쓰기(학습 세션, 독서 기록, 발행, 제출, 응시 …)
   └─▶ on…Created 트리거가 activities 문서 생성 (클라이언트는 activities를 직접 쓰지 않음)
          └─▶ onActivityCreated
                ├ 포인트 계산 (shared/points.ts, 악용 방지 CMN-70~76) → pointLedger, members.points
                ├ 연속 학습일·일지 연속일 갱신 (사용자 시간대)
                ├ 뱃지 판정
                ├ 피드: major → 그대로, minor → feedDigests 묶음 (CMN-13)
                ├ dailySummaries 갱신 (NOTE-32)
                ├ 자동 확인형 미션 판정 (MIS-03)
                └ 랭킹 갱신
```
(내 공간의 활동은 포인트·피드·랭킹을 건너뛰고 개인 연속 학습일·통합 현황만 갱신)

| 트리거 | 하는 일 | 단계 |
| --- | --- | --- |
| `onStudySessionCreated` | 단어 학습 활동 생성, 매칭 기록이면 `matchTop` 갱신 | 1 |
| `onCardStateWritten` | 진도(`deckProgress`) 집계, 틀린 카드 → 오답 노트 | 1 / 3 |
| `onCardWritten` | 카드 수 집계, 뜻 크게 변경 시 `contentRev` 처리 | 1 |
| `onPageWritten` | 독후감 발행·일지 작성 활동, 역링크(`pageLinks`) 갱신, 편집 잠금 해제 시 버전 스냅샷 | 1 / 2 / 3 |
| `onReadingLogCreated` · `onShelfWritten` | 독서 활동, 워크스페이스 책장 묶음(`books`) 갱신, 함께 읽기 진행 | 2 |
| `onSubmissionWritten` | 제출·승인 활동, 동료 검토자 배정(MIS-35), 알림 | 2 / 4 |
| `onAttemptWritten` | 응시 활동, 통계(연습 제외), 틀린 문제 → 오답 노트 (결과 공개 시점 반영) | 3 |
| `onActivityCreated` | 위 흐름 | 1 |
| `onCommentCreated` | 알림(멘션·댓글·피드백), 댓글·피드백 수 | 2 |
| `onMissionWritten` · `onTestWritten` · `onQuestionWritten` | 역할 목록 변경 시 하위 문서 복사본(`reviewerUids`, `hostIds`, `authorIds`) 동기화, 원본 수정 시 복사본 주인에게 알림(TST-08) | 2 / 3 |
| `onMemberWritten` | 멤버 수, 그룹 멤버 수, 사용자 `spaceIds` 동기화, 나간 멤버의 노트 `ownerStatus` | 0 |
| `onGroupDeleted` | 알림, 복원 기간 기록 | 2 |
| `onFileFinalized` · `onFileDeleted` (Storage) | 업로드 용량 집계(CMN-61·62), 이미지 축소본, 80% 알림 | 1 |

## 4. 스케줄
| 이름 | 주기 | 하는 일 | 단계 |
| --- | --- | --- | --- |
| `cronDailyClose` | 매시 정각 | 그 시각에 자정을 맞은 시간대 사용자들의 하루 요약 고정(NOTE-33), 연속 학습일 끊김 처리 | 2 |
| `cronReminders` | 15분마다 | 복습·일지 리마인더, 미션 마감 24시간 전 알림 | 3 |
| `cronPurgeTrash` | 매일 | 30일 지난 휴지통·그룹 완전 삭제 | 1 |
| `cronSpaceDeletion` | 매일 | 유예 끝난 워크스페이스 삭제 | 0 |
| `cronRankings` | 매주 월 0시 | 주간 랭킹 마감·초기화 | 4 |
| `cronPointAnomaly` | 매시 | 포인트 급증 감지 → 소유자·매니저 알림 (CMN-78) | 4 |

## 5. 리뷰 질문
- 없음

## 6. 변경 이력
- v2.4: callable을 Hosting rewrite(`/fn/{이름}`)로 호출
- v2.3: `acceptOwnership` → `respondOwnership`(수락·거절)
- v2.2: `createInvite`·`getInvite` 추가(코드 유일성·비멤버 미리보기), `decideJoinRequest`를 0단계로
- v2.1: 확정 — 초대 메일은 Firebase Auth 이메일 링크 우선, 필요 시 Trigger Email + 무료 SMTP (2-1)
- v2.0: 확정 기능명세 기준으로 새로 작성
