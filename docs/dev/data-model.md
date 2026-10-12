# 데이터 모델

> 상태: 확정 · v2.3 — 데이터 구조의 원본. 기능명세 ID를 괄호로 표시한다.

## 0. 원칙
1. **공간 격리**: 공간에 속한 데이터는 모두 `spaces/{spaceId}/...` 아래에 둔다. 규칙에서 멤버십 하나로 대부분 보호된다. 내 공간도 같은 구조다 ([architecture.md](./architecture.md#2-핵심-설계-공간space)).
2. **개인 상태 문서 ID = `{uid}_{refId}`**: 쿼리 없이 바로 읽고, 규칙에서 소유자를 검사하기 쉽다.
3. **메타와 본문 분리**: 목록에서 큰 데이터를 읽지 않는다 (페이지 메타 ↔ 블록, 단어장 ↔ 카드).
4. **복사본 + 서버 집계**: 표시용 이름·카운터·검사용 역할 목록은 복사해 두고 서버 기능이 동기화한다.
5. 모든 문서: `createdAt`, `updatedAt`(`serverTimestamp()`), 작성자 필드(`createdBy` 또는 `uid`/`ownerId`), `schemaVersion`.
6. 문서 1개 최대 1MiB. 배열 필드는 수백 개 이내.
7. 순서가 있는 것(페이지, 블록, 카드, 레슨)은 `order`에 **fractional index 문자열**을 쓴다 → 끼워 넣을 때 다른 문서를 고치지 않는다.
8. 삭제는 기본 **휴지통**(`deletedAt`) → 서버가 기간 후 완전 삭제.

## 1. 사용자 · 계정 (ACC)
```
users/{uid}
  kind: 'standard' | 'child'
  displayName, photoURL, bio, email?        # 아이 계정은 email 없음
  timezone, locale, birthYear?
  personalSpaceId: 'p_{uid}'
  spaceIds: string[]                        # 서버 관리 (참여 중인 공간)
  guardianIds: string[]                     # 아이 계정: 보호자 uid (ACC-06~09)
  wardIds: string[]                         # 보호자 계정: 관리 중인 아이 uid
  settings: {
    notifications: { [type]: { inApp, push } }, quietHours,   # ACC-20
    reminders: { review?: 'HH:mm', journal?: 'HH:mm' },       # ACC-21
    theme, fontScale,                                         # ACC-23
    study: { dailyNewCards, dailyReviewCards, flashcardFront } # ACC-24
  }
  storage: { usedBytes, limitBytes }         # 서버 관리 (CMN-61)
  streak: { current, best, lastDate }        # 서버 관리, 모든 공간 합산 (ACC-30)

users/{uid}/notifications/{id}   spaceId?, type, actorId, refPath, title, body, read, createdAt
users/{uid}/fcmTokens/{token}    platform, createdAt
users/{uid}/uploads/{fileId}     spaceId, path, size, contentType, refType?, refId?, createdAt   # CMN-62
users/{uid}/badges/{badgeId}     spaceId, earnedAt

childLoginCodes/{codeHash}       # 서버 전용. 클라이언트 접근 불가
  childUid, createdBy, createdAt, revokedAt?
guardianInvites/{id}             # 서버 전용
  childUid, invitedBy, email, expiresAt, acceptedBy?
```
- 보호자의 아이 데이터 열람은 보호자 계정의 **커스텀 클레임 `wards`**(아이 uid 목록)로 규칙에서 판정한다 → [security.md](./security.md).

## 2. 공간 · 멤버 · 그룹 · 초대 (WS)
```
spaces/{spaceId}
  kind: 'workspace' | 'personal'
  name, icon, color, description
  ownerId
  modules: { notes, vocab, courses, reading, reviews, missions, tests, math, wrongNotes }   # WS-02
  settings: {
    joinPolicy: 'link' | 'approval',                                   # WS-03
    whoCanInvite, whoCanCreate, whoCanHost: 'everyone' | 'managers',   # WS-04
    progressSharing: 'everyone' | 'self',
    ranking: { enabled: true },                                        # CMN-05
    points: { [action]: number },                                      # WS-05
    feedback: { scoreEnabled: false, scoreFormat: '100'|'grade'|'stars' },  # CMN-24
    journal: { defaultVisibility, templateId }                         # WS-06
  }
  subjects: [{ id, name, color }]           # WS-09 공통 과목
  stamps: [{ id, label, emoji }]            # CMN-26
  memberCount, maxMembers                   # WS-08 (R5)
  deleteScheduledAt?                        # WS-07 유예
  ownershipTransfer?: { from, to, at }       # WS-25 수락 대기 (서버 관리)
  createdAt, updatedAt

spaces/{spaceId}/members/{uid}
  access: 'owner' | 'manager' | 'member'
  status: 'active' | 'pending' | 'left' | 'removed'      # left/removed: 노트는 본인만 (WS-23·24)
  displayName, photoURL                     # 공간별 표시 이름 (ACC-11)
  groupIds: string[]
  hideProgress: bool                        # ACC-22
  wrongNoteShare: { mode: 'private'|'people'|'groups'|'space', uids[], groupIds[], subjects?[] }  # WRN-13
  points: { total, week, weekKey }          # 서버 관리
  streak, journalStreak                     # 서버 관리
  stats: { created, hosted, feedbackGiven } # 서버 관리
  joinedAt, leftAt?

spaces/{spaceId}/groups/{groupId}    name, color, joinable, createdBy, memberCount, deletedAt?   # WS-30~33
spaces/{spaceId}/invites/{code}      code, createdBy, expiresAt?, maxUses?, uses, disabled        # WS-10~11 (code: 컬렉션 그룹 조회용, 문서 ID와 같음)
spaces/{spaceId}/emailInvites/{id}   email, createdBy, expiresAt                                  # WS-12
spaces/{spaceId}/tags/{tagId}        name, color                                                  # CMN-51
spaces/{spaceId}/templates/{id}      kind: 'journal'|'review'|'page'|'mission', name, ownerId?, scope: 'space'|'personal', blocks[], props
```

## 3. 공통 (CMN)
```
spaces/{sid}/activities/{id}              # 서버만 생성
  uid, module, type, size: 'major' | 'minor', refType, refId
  summary, data: map, visibility, date: 'YYYY-MM-DD', createdAt
  # 예: { module:'vocab', type:'session', size:'minor', data:{ deckId, cards:42, correctRate:0.86, minutes:12 } }

spaces/{sid}/feedDigests/{uid}_{date}     # 작은 활동 묶음 (CMN-13), 서버 관리
  uid, date, lines: [{ module, text }], updatedAt

spaces/{sid}/comments/{id}
  targetType, targetId, blockId?, uid
  kind: 'comment' | 'feedback'
  body, stamp?, score?                      # feedback일 때 (CMN-24)
  mentions[], createdAt, editedAt?

spaces/{sid}/reactions/{targetType}_{targetId}_{uid}   targetType, targetId, uid, emoji

spaces/{sid}/feedbackRequests/{id}        # CMN-23
  targetType, targetId, requesterId, reviewerUid, status: 'open'|'done'|'cancelled', createdAt

spaces/{sid}/pointLedger/{id}             # 서버만, 포인트 내역 (CMN-77)
  uid, action, points, refType, refId, reason?, adjustedBy?, createdAt
spaces/{sid}/rankings/{periodKey}         # 서버만, 예: 'week_2026-W41'
  entries: [{ uid, points }], updatedAt
```

## 4. 노트 · 학습일지 · 모음 (NOTE)
블록마다 문서 1개 (D2). 저장·동기화 방식은 [editor.md](./editor.md).

```
spaces/{sid}/pages/{pageId}
  type: 'page' | 'journal' | 'bookReview' | 'lessonNote' | 'item'    # item: 사용자 모음의 페이지
  collectionId?                         # 'journal' | 'bookReview' | 사용자 모음 id
  title, icon, cover
  ownerId
  root: 'private' | 'shared'            # NOTE-20
  parentId: string | null
  order                                 # fractional index
  ancestorIds: string[]                 # 이동·휴지통 연쇄 처리
  props: map                            # 모음 항목 값 { date, subjects[], minutes, mood, rating, bookKey, … }
  visibility: 'private' | 'people' | 'group' | 'space'                # NOTE-50
  groupIds[], sharedWith[], editorIds[], reviewerIds[]                 # NOTE-53·54
  missionIds[]                          # 제출된 미션 (서버 관리)
  status: 'draft' | 'published'         # 독후감
  excerpt                               # 목록 미리보기 200자
  blockCount, textLength
  lock: { uid, at } | null              # NOTE-60
  ownerStatus: 'active' | 'left'        # 작성자가 나가면 'left' → 본인 외 숨김 (WS-23)
  copiedFrom?: { spaceId, pageId }
  commentCount, feedbackCount, reactionCounts   # 서버 관리
  deletedAt?, createdAt, updatedAt

spaces/{sid}/pages/{pageId}/blocks/{blockId}     # blockId = 편집기 UniqueID
  type                                  # paragraph, heading, bulletItem, todo, toggle, image, embed, drawing …
  parentBlockId: string | null          # 목록 중첩, 토글·열 안의 블록
  order
  attrs: map                            # level, checked, src, refType/refId …
  content: array                        # 인라인 텍스트 + 서식 (ProseMirror inline JSON)
  rev: number                           # 블록 저장마다 +1 (충돌 감지)
  updatedBy, updatedAt

spaces/{sid}/pages/{pageId}/versions/{versionId} # NOTE-63
  createdBy, createdAt, blockCount, storagePath   # 블록 스냅샷 JSON은 Storage에

spaces/{sid}/collections/{collectionId}          # NOTE-46~49
  kind: 'system' | 'custom', systemType?: 'journal' | 'bookReview'
  name, icon, ownerId, scope: 'private' | 'shared'
  schema: [{ key, name, type, options? }]       # date, select, multiSelect, number, rating, checkbox, person, relation, text
  views: [{ id, name, type: 'list'|'calendar'|'table'|'gallery', filter, sort, groupBy }]
  templateIds[]

spaces/{sid}/dailySummaries/{uid}_{date}         # NOTE-32·33, 서버 관리
  uid, date, items: { total, vocab, courses, reading, notes, missions, tests, math, wrongNotes, social }
  frozenAt?                                      # 하루 마감 시 고정

spaces/{sid}/pageLinks/{fromPageId}_{toPageId}   # NOTE-24 역링크, 서버 관리
```
- 학습일지: `type: 'journal'`, `collectionId: 'journal'`, `props.date`. 하루 여러 장 허용(NOTE-30) → 날짜로 ID를 만들지 않는다.
- 내 일지 모아 보기(NOTE-39): `collectionGroup('pages')` where `ownerId == me` and `type == 'journal'`.
- 내 공간 노트(NOTE-26): `spaces/p_{uid}/pages`, `visibility`는 항상 `private`.

## 5. 외국어 학습 (VOC)
```
spaces/{sid}/decks/{deckId}
  title, description, langFrom, langTo, tags[], folderId?, cover?
  fields: string[]                      # 이 단어장에서 쓰는 카드 항목 (VOC-10)
  visibility: 'private' | 'group' | 'space', groupIds[]     # VOC-01
  createdBy, editPolicy: 'author'|'collaborators'|'everyone', collaboratorIds[]
  cardCount, learnerCount               # 서버 관리
  copiedFrom?: { spaceId, deckId }
  deletedAt?, createdAt, updatedAt

spaces/{sid}/decks/{deckId}/cards/{cardId}
  front, back: string[], pos?, phonetic?
  audio?: { fileId?, tts: bool }
  examples: [{ text, translation? }]
  forms?: map                           # 복수형, 과거형 …
  synonyms: [{ text, cardId? }], antonyms: [{ text, cardId? }]
  collocations[], imageFileId?, tip?, tags[], difficulty?
  order, contentRev                     # 뜻이 크게 바뀌면 +1 (VOC 예외 상황)

spaces/{sid}/deckFolders/{folderId}     name, order, ownerId

spaces/{sid}/cardStates/{uid}_{cardId}  # VOC-40
  uid, deckId, cardId
  status: 'new' | 'learning' | 'review' | 'mastered'
  ease, intervalDays, due, reps, lapses, correct, wrong
  starred, lastReviewedAt, contentRev

spaces/{sid}/deckProgress/{uid}_{deckId}
  uid, deckId, masteredCount, learningCount, lastStudiedAt, bestMatchMs

spaces/{sid}/decks/{deckId}/matchTop/top  # VOC-23 상위 10명, 서버 관리
  entries: [{ uid, ms, at }]

spaces/{sid}/studySessions/{id}
  uid, deckId?, mode, cards, correct, newlyMastered, durationSec, startedAt, endedAt
```
- 전체 오늘의 복습(WS-53): `collectionGroup('cardStates')` where `uid == me` and `due <= now` orderBy `due`.
- 공간 안 오늘의 복습(VOC-44): `spaces/{sid}/cardStates` where `uid == me` and `due <= now`.

## 6. 강의자료 (CRS)
```
spaces/{sid}/courses/{courseId}
  title, description, cover, subjectId, level
  visibility: 'group' | 'space', groupIds[]
  createdBy, editPolicy, collaboratorIds[]
  lessonCount, order, copiedFrom?, deletedAt?

spaces/{sid}/courses/{courseId}/lessons/{lessonId}
  title, order, publishAt?, requiresPrev: bool
  materials: [{ id, type: 'doc'|'pdf'|'audio'|'video'|'image'|'link'|'office'|'file',
                title, fileId?, url?, pageId?, size?, contentType?, durationSec? }]
  linkedDeckIds[], linkedProblemSetIds[], linkedTestIds[], missionId?    # CRS-02·06
  completion: 'manual' | 'test' | 'mission'                              # CRS-21
  majorRev                                                               # "업데이트됨" 표시용

spaces/{sid}/lessonProgress/{uid}_{lessonId}
  uid, courseId, lessonId, completedAt?, noteId?, highlights[], seenRev
```

## 7. 독서 (READ)
책은 각자 자기 책장에 등록한다(READ-01). 같은 책은 `bookKey`로 묶는다(READ-03).
- `bookKey` = ISBN-13이 있으면 `isbn:{isbn13}`, 없으면 `t:{정규화한 제목+저자 해시}`.
- 내 공간(`p_{uid}`)에서도 같은 구조(`shelf`, `readingLogs`, `quotes`)를 쓴다. 내 공간에는 `books`(묶음)·`readingGroups`를 만들지 않는다 (서버 트리거가 `kind == 'personal'`이면 건너뜀).
- 같은 책을 내 공간과 워크스페이스 책장에 따로 담을 수 있다 (공간마다 별도 기록). 통합 독서 통계는 서버가 공간을 합쳐 계산.

```
spaces/{sid}/shelf/{uid}_{bookKey}            # 내 책장 (READ-10~11)
  uid, bookKey, title, authors[], publisher?, cover?
  format: 'paper' | 'ebook' | 'audio'          # READ-05
  total: { pages? , percent: 100, minutes? }
  status: 'want' | 'reading' | 'done' | 'dropped'
  position: { page? , percent? , minutes? }
  startedAt?, finishedAt?, rating?

spaces/{sid}/books/{bookKey}                  # 워크스페이스 책장 묶음 (READ-13·15), 서버 관리
  title, authors[], cover, readerUids[], readingCount, doneCount, avgRating, reviewCount, lastActivityAt

spaces/{sid}/readingLogs/{id}                 # READ-20
  uid, bookKey, date, from?, to?, unit: 'page'|'percent'|'minute', minutes, memo?

spaces/{sid}/quotes/{id}                      # READ-30
  uid, bookKey, position, text, visibility: 'private' | 'space'

spaces/{sid}/readingGroups/{id}               # READ-40~45
  bookKey, book: { title, authors, cover }
  startAt, endAt
  assignees: { all, groupIds[], uids[] }, joinable, participantIds[]
  createdBy, hostIds[]
  schedule: [{ id, label, from, to, dueDate }]   # READ-45
  missionId?, closedAt?
```
- 함께 읽기 이야기 나누기(READ-43): `comments` with `targetType: 'readingGroup'`, `attrs.scheduleId`, `spoilerPosition`.

## 8. 독후감 (REV)
- `pages`의 `type: 'bookReview'`, `collectionId: 'bookReview'`, `props: { bookKey, rating, period }`.
- 기본 공개 범위 `space` (REV-02). 피드백은 `comments(kind: 'feedback')`.

## 9. 미션 (MIS)
```
spaces/{sid}/missions/{missionId}
  title, descriptionPageId?
  type: 'check' | 'submission' | 'auto'
  autoRule?: { kind, targetId?, threshold? }                 # MIS-03
  recurrence: { kind: 'once'|'daily'|'weekly', weekdays?[] }  # MIS-11
  startAt, endAt?, allowLate
  assignees: { all, groupIds[], uids[] }, includeSelf, joinable, participantIds[]
  reward?: { points, badgeId? }
  isPersonal: bool                                            # MIS-14
  linked?: { type: 'readingGroup'|'lesson'|'test', id }       # MIS-16
  notifyOnComplete: 'feed' | 'all' | 'none'                   # MIS-17
  peerReview?: { enabled, perSubmission, requiredReviews, anonymous: false }   # MIS-35·36
  createdBy, hostIds[], reviewerIds[]
  closedAt?

spaces/{sid}/missions/{missionId}/submissions/{uid}_{periodKey}
  uid, periodKey                         # 'once' | '2026-10-06' | '2026-W41'
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'done'
  content?, attachments: [fileId], pageId?
  late: bool, submittedAt?
  reviewerUids[]                         # 진행자·리뷰어 복사본 − 본인 (서버 관리)
  peerReviewerUids[]                     # 배정된 동료 검토자
  reviewedBy?, reviewedAt?, reason?

spaces/{sid}/missions/{missionId}/peerReviews/{id}
  submissionId, reviewerUid, stamp?, body, createdAt
```

## 10. 테스트 · 수학 (TST · MATH)
```
spaces/{sid}/questions/{questionId}
  type, subject: 'language'|'math'|'general', subjectId?
  prompt: blocks[], choices?[], media?[]
  tags[], unit?, difficulty, defaultPoints, hints?[]
  createdBy, collaboratorIds[]
  sharing: 'private' | 'space'            # TST-08 (기본 private)
  answerVisibility: 'authors' | 'space'   # TST-07 (기본 authors)
  setIds[]                                # 문제 묶음
  copiedFrom?: { spaceId, questionId, rev }, rev
  deletedAt?

spaces/{sid}/questionKeys/{questionId}     # 정답 (규칙: authorIds 또는 공개 설정만 읽기)
  answer, acceptable[], tolerance?, explanation: blocks[], rubric?
  authorIds[], answerVisibility           # 검사용 복사본

spaces/{sid}/questionSets/{setId}          title, questionIds[], createdBy, sharing

spaces/{sid}/tests/{testId}
  title, description
  questionRefs: [{ questionId, points }], pickRule?
  settings: { timeLimitSec?, openAt, closeAt, maxAttempts, scoring: 'best'|'last',
              shuffleQuestions, shuffleChoices,
              resultRelease: 'instant'|'afterClose'|'scoreOnly'|'hidden', practice }
  assignees, missionId?                   # TST-19
  createdBy, hostIds[]
  stats: { attempts, avg }                # 서버 관리 (연습 응시 제외)

spaces/{sid}/tests/{testId}/attempts/{attemptId}
  uid, isPractice, startedAt, deadlineAt?, submittedAt?
  order[], answers: map
  score?, maxScore, itemResults: map, gradingStatus: 'auto'|'pending'|'done'
  hostIds[]                               # 검사용 복사본

spaces/{sid}/problemSets/{setId}           # MATH-10·13
  title, grade?, unit: { curriculumCode?, custom? }, questionIds[]
  visibility, createdBy, editPolicy, collaboratorIds[], hintPenalty?

spaces/{sid}/problemAttempts/{uid}_{questionId}
  uid, questionId, tries, correct, hintsUsed, lastAnswer, isPractice, lastAt

spaces/{sid}/drillRecords/{id}             uid, kind, config, score, durationSec, createdAt
spaces/{sid}/drillTop/{kind}               entries[] (서버 관리)
spaces/{sid}/answerAppeals/{id}            questionId, uid, answer, status, createdAt   # MATH 이의 신청

curricula/{curriculumId}                   # 전역 참고 데이터 (읽기 전용)
  name, grades: [{ grade, units: [{ code, name, children[] }] }]
```

## 11. 통합 오답 노트 (WRN)
```
spaces/{sid}/wrongNotes/{uid}_{refType}_{refId}
  uid, refType: 'card' | 'question', refId
  subjectId?, sources: [{ type: 'deck'|'test'|'problemSet', id, name }]
  wrongCount, lastWrongAt, consecutiveCorrect
  resolved: bool, resolvedAt?, manual: bool        # WRN-02·21
  memo?                                             # WRN-12
  snapshot: { front?, back?, prompt?, answer? }     # 원본 삭제 대비 (WRN 예외)
```
- 공유(WRN-13)는 작성자 멤버 문서의 `wrongNoteShare`로 판정.

## 12. Storage 경로
```
spaces/{sid}/files/{uid}/{fileId}/{fileName}     # 모든 업로드 (작성자별 폴더 → 용량 집계)
spaces/{sid}/derived/{fileId}/...                # 썸네일, PDF 변환본 (서버 생성)
spaces/{sid}/pageVersions/{pageId}/{versionId}.json
users/{uid}/avatar/{fileName}
```
- 업로드 완료 시 서버 트리거가 `users/{uid}/uploads`와 `storage.usedBytes`를 갱신한다.

## 13. 주요 쿼리 · 복합 인덱스
| 용도 | 쿼리 | 인덱스 |
| --- | --- | --- |
| 전체 오늘의 복습 | CG `cardStates`: uid ==, due <= | CG: uid ASC, due ASC |
| 공간 오늘의 복습 | `cardStates`: uid ==, due <= | uid ASC, due ASC |
| 페이지 계층 | `pages`: root ==, parentId ==, deletedAt == null, orderBy order | root, parentId, deletedAt, order |
| 블록 불러오기 | `blocks` orderBy order | 단일 |
| 내 학습일지 | `pages`: ownerId ==, type == 'journal', props.date 범위 | ownerId, type, props.date |
| 내 일지 모아 보기 | CG `pages`: ownerId ==, type == 'journal', props.date 범위 | CG: ownerId, type, props.date |
| 멤버 일지 | `pages`: type == 'journal', visibility == 'space', props.date 범위 (+ group, sharedWith 쿼리 병합) | type, visibility, props.date / type, sharedWith(배열), props.date |
| 피드 | `activities` orderBy createdAt desc | 단일 |
| 일지 요약 계산 | `activities`: uid ==, date == | uid, date |
| 내가 연 미션 | `missions`: hostIds array-contains, closedAt == null | hostIds, closedAt |
| 검토할 제출물 | CG `submissions`: reviewerUids array-contains, status == 'submitted' | CG |
| 피드백 요청받은 것 | `feedbackRequests`: reviewerUid ==, status == 'open' | reviewerUid, status |
| 공유된 문제 | `questions`: sharing == 'space', deletedAt == null | sharing, deletedAt, updatedAt |
| 내 오답 | `wrongNotes`: uid ==, resolved ==, orderBy lastWrongAt | uid, resolved, lastWrongAt |

인덱스는 `firestore.indexes.json`에 정의한다.

## 14. 한도 상수 (R5)
`shared/limits.ts`에 두고 운영 중 조정한다.

| 상수 | 기본값 |
| --- | --- |
| 워크스페이스 최대 인원 | 100 |
| 계정당 업로드 총량 | 2 GB |
| 파일 1개 최대 (대안 정책 시) | 500 MB |
| 블록 1개 최대 텍스트 | 10,000자 |
| 페이지당 블록 경고 | 2,000개 |
| 휴지통 보관 | 30일 |
| 그룹 삭제 복원 기간 | 30일 |
| 워크스페이스 삭제 유예 | 7일 |

## 15. 리뷰 질문
- 없음

## 16. 변경 이력
- v2.3: `spaces.ownershipTransfer`(WS-25)
- v2.2: `invites`에 `code` 필드(컬렉션 그룹 조회용)
- v2.1: 확정 — 내 공간에 개인 독서·독후감 추가, 최대 인원 기본 100명 확정
- v2.0: 확정 기능명세 기준으로 새로 작성
