# 보안 규칙

> 상태: 확정 · v2.10 — `firestore.rules`는 `users/{uid}`(본인 읽기), `spaces/{sid}`(멤버 읽기, 매니저 수정), `members`(멤버 읽기), `invites`(만든 사람·매니저 읽기·끄기)만 적용, 나머지는 차단. `storage.rules`는 전체 차단. 0-8에서 이 설계 전체로 교체한다.

## 1. 원칙
- **화면의 권한 표시는 편의, 실제 강제는 규칙과 서버 기능.**
- 사람 등급이 없다. 판정은 두 가지뿐이다 ([planning/users-and-roles.md](../planning/users-and-roles.md)):
  1. **이 공간의 활성 멤버인가** (+ 운영 작업이면 `access`가 owner/manager인가)
  2. **이 문서와 무슨 관계인가** — 작성자(`createdBy`/`ownerId`/`uid`), 공동 편집자(`collaboratorIds`/`editorIds`), 진행자(`hostIds`), 리뷰어(`reviewerIds`/`reviewerUids`), 열람 허용(`sharedWith`)
- 관계는 **문서 안 배열 필드**로 판정 → 추가 읽기 없이 검사. 하위 문서에는 검사용 복사본을 둔다 (서버가 동기화).
- **보호자 예외**: 보호자 계정의 커스텀 클레임 `wards`(아이 uid 목록)에 문서 주인이 있으면 읽기 허용 (ACC-08).
- 운영 권한(owner/manager)으로는 **남의 비공개 글·숨긴 진도를 볼 수 없다.**
- 조작되면 안 되는 값(운영 권한, 포인트, 연속 학습일, 점수, 카운터, 활동, 역할 복사본)은 클라이언트 쓰기 금지.
- 규칙의 문서 읽기(`get`/`exists`)는 요청당 10회(묶음 쓰기·트랜잭션은 20회) 한도 → 헬퍼는 최소 읽기로.
- App Check 적용.

## 2. 헬퍼 (초안)
```
function signedIn() { return request.auth != null; }
function uid() { return request.auth.uid; }
function wards() { return request.auth.token.get('wards', []); }
function isGuardianOf(ownerUid) { return signedIn() && ownerUid in wards(); }

function memberPath(sid) { return /databases/$(database)/documents/spaces/$(sid)/members/$(uid()); }
function me(sid) { return get(memberPath(sid)).data; }
function isMember(sid) { return signedIn() && exists(memberPath(sid)) && me(sid).status == 'active'; }
function isManager(sid) { return isMember(sid) && me(sid).access in ['owner', 'manager']; }
function space(sid) { return get(/databases/$(database)/documents/spaces/$(sid)).data; }

function allowed(sid, key) {          // key: whoCanCreate / whoCanHost / whoCanInvite
  return isMember(sid) && (space(sid).settings[key] == 'everyone' || isManager(sid));
}
function isPersonal(sid) { return sid == 'p_' + uid(); }   // 내 공간

function canEditContent(d) {
  return d.createdBy == uid()
    || (d.editPolicy == 'collaborators' && uid() in d.collaboratorIds)
    || d.editPolicy == 'everyone';
}
function seesProgressOf(sid, ownerUid) {   // 진도 공유 (ACC-22, WS-04)
  return ownerUid == uid() || isGuardianOf(ownerUid)
    || (isMember(sid) && space(sid).settings.progressSharing == 'everyone'
        && get(/databases/$(database)/documents/spaces/$(sid)/members/$(ownerUid)).data.hideProgress != true);
}
function unchanged(fields) { return !request.resource.data.diff(resource.data).affectedKeys().hasAny(fields); }
function onlyChanges(fields) { return request.resource.data.diff(resource.data).affectedKeys().hasOnly(fields); }
```
> 내 공간(`p_{uid}`)도 멤버 문서(본인, owner)를 가지므로 `isMember`가 그대로 동작한다. `isPersonal`은 내 공간 전용 제약(공개 범위 강제 등)에만 쓴다.

## 3. 컬렉션별 요약

### 사용자 · 계정
| 경로 | 읽기 | 쓰기 |
| --- | --- | --- |
| `users/{uid}` | 본인, 보호자 | 본인: `displayName`, `photoURL`, `bio`, `timezone`, `locale`, `settings`만. 나머지 서버 |
| `users/{uid}/notifications` | 본인 | 본인: `read`만 / 생성은 서버 |
| `users/{uid}/fcmTokens` | 본인 | 본인 |
| `users/{uid}/uploads`, `badges` | 본인, 보호자 | 서버 |
| `childLoginCodes`, `guardianInvites` | 없음 | 서버 |

### 공간
| 경로 | 읽기 | 생성 | 수정 | 삭제 |
| --- | --- | --- | --- | --- |
| `spaces/{sid}` | 멤버 | 서버 | manager: `name`·`icon`·`color`·`description`·`modules`·`settings`·`subjects`·`stamps` | 서버 |
| `members/{uid}` | 멤버 | 서버 | 본인: `displayName`·`photoURL`·`hideProgress`·`wrongNoteShare`만 | 서버 |
| `groups` | 멤버 | 멤버 (WS-30) | 멤버 (WS-31·33) | 서버(복원 기간 후) |
| `invites` | 만든 사람, manager | 서버 (`createInvite`가 `whoCanInvite` 확인) | 만든 사람, manager: `disabled`만 | 만든 사람, manager |
| `tags`, `templates` | 멤버 | `whoCanCreate` (개인 템플릿은 모든 멤버) | 만든 사람, manager | 만든 사람, manager |

### 공유 콘텐츠 (단어장·카드, 코스·레슨, 문제집, 문제 묶음)
| 동작 | 조건 |
| --- | --- |
| 읽기 | 멤버 && (공개 대상이 `space` / `group`이면 내 그룹 포함 / `private`이면 작성자) |
| 생성 | `allowed(sid, 'whoCanCreate')` (내 공간은 본인) && `createdBy == uid()` |
| 수정 | `canEditContent` && `createdBy`·`copiedFrom`·카운터 불변 && 역할 배열(`collaboratorIds`, `editPolicy`, 공개 범위)은 작성자만 |
| 삭제 | 작성자, manager |
| 하위(카드·레슨) | 상위 문서 기준 (`get` 1회) |

### 개인 학습 기록
`cardStates`, `deckProgress`, `lessonProgress`, `shelf`, `readingLogs`, `problemAttempts`, `studySessions`, `drillRecords`

| 동작 | 조건 |
| --- | --- |
| 읽기 | `seesProgressOf(sid, resource.data.uid)` |
| 쓰기 | 본인 (`uid` 필드 == `uid()`, 문서 ID가 `{uid}_`로 시작하는 경우 함께 확인) |
| 컬렉션 그룹 읽기 | `match /{path=**}/cardStates/{id}`: `resource.data.uid == uid()` (전체 오늘의 복습 WS-53) |

### 오답 노트
| 동작 | 조건 |
| --- | --- |
| 읽기 | 본인, 보호자, 작성자의 `wrongNoteShare`에 해당하는 멤버 (`get` 1회) |
| 쓰기 | 본인: `memo`·`resolved`(직접 해결)·`manual` 추가만 / 나머지 서버. 3-C1 적용: 본인 읽기, 쓰기는 서버. 3-C2: 본인은 `resolved`·`resolvedAt`만(`consecutiveCorrect`는 0으로) 바꿀 수 있고 만들기·지우기는 안 됨 |

### 노트 · 블록
```
match /spaces/{sid}/pages/{pageId} {
  function canRead(d) {
    return d.ownerId == uid()
      || isGuardianOf(d.ownerId)
      || (isMember(sid) && d.deletedAt == null && d.ownerStatus == 'active' && (
           d.visibility == 'space'
           || (d.visibility == 'group' && me(sid).groupIds.hasAny(d.groupIds))
           || uid() in d.sharedWith
           || uid() in d.editorIds));
  }
  function canEdit(d) {
    return isMember(sid) && (d.ownerId == uid() || uid() in d.editorIds
      || (d.root == 'shared' && d.get('editPolicy', 'everyone') == 'everyone'));
  }
  allow read: if canRead(resource.data);
  allow create: if isMember(sid) && request.resource.data.ownerId == uid()
    && (request.resource.data.root == 'private' || allowed(sid, 'whoCanCreate'))
    && (!isPersonal(sid) || request.resource.data.visibility == 'private');
  allow update: if canEdit(resource.data)
    && unchanged(['ownerId', 'ownerStatus', 'missionIds', 'commentCount', 'feedbackCount', 'reactionCounts', 'copiedFrom'])
    && (resource.data.ownerId == uid()
        || unchanged(['visibility', 'groupIds', 'sharedWith', 'editorIds', 'reviewerIds']));
  allow delete: if false;   // 휴지통 이동·완전 삭제는 서버 (NOTE-22)

  match /blocks/{blockId} {
    function page() { return get(/databases/$(database)/documents/spaces/$(sid)/pages/$(pageId)).data; }
    allow read: if canRead(page());
    allow write: if canEdit(page())
      && (page().lock == null || page().lock.uid == uid());     // 편집 잠금 (NOTE-60)
  }
}
```
- 목록 쿼리도 규칙을 만족해야 한다: 남의 노트는 `visibility == 'space'` / `group` / `sharedWith array-contains me` 쿼리를 따로 실행해 합친다.
- 공개 범위·공유 대상은 **작성자만** 바꾼다. 피드백 요청·미션 제출로 인한 추가는 서버 기능이 한다.
- 블록 쓰기의 `page()` 읽기 횟수: 에뮬레이터 검증 완료(S1, [spikes.md](./spikes.md)). 같은 문서는 묶음 전체에서 한 번만 센다. `exists()`와 `get()`은 따로 세는 것으로 보이므로 `isMember`는 `get()` 하나로 줄이는 것을 검토.
- 내 일지 모아 보기: `match /{path=**}/pages/{pageId}`에 `resource.data.ownerId == uid()` 허용.

### 공통
| 경로 | 읽기 | 쓰기 |
| --- | --- | --- |
| `activities`, `feedDigests`, `rankings`, `dailySummaries`, `pointLedger` | 멤버 (`dailySummaries`·`pointLedger`는 본인·보호자 + manager는 ledger 전체) | 서버 |
| `comments` (`kind: 'comment'`) | 대상을 읽을 수 있는 사람 | 생성: 멤버 / 수정: 작성자 / 삭제: 작성자, manager |
| `comments` (`kind: 'feedback'`) | 대상을 읽을 수 있는 사람 | 서버 (`giveFeedback`) |
| `reactions` | 멤버 | 본인 |
| `feedbackRequests` | 요청자, 요청받은 사람 | 서버 |

> 댓글 읽기는 대상 문서를 다시 읽어야 한다. 대상 종류마다 `targetPath`를 댓글에 넣어 `get` 1회로 판정한다.

### 독서
| 경로 | 읽기 | 쓰기 |
| --- | --- | --- |
| `books` (묶음) | 멤버 | 서버 |
| `quotes` | 본인, 보호자, (`visibility == 'space'`면) 멤버 | 본인 |
| `readingGroups` | 멤버 | 생성 `whoCanHost` / 수정 진행자 / 참여 목록은 서버 |

> 진도를 숨긴 멤버도 **읽는 책 제목은 보인다**(READ 예외). `books.readerUids`는 공개, `shelf`의 위치·기록은 `seesProgressOf`.

### 미션
| 경로 | 읽기 | 쓰기 |
| --- | --- | --- |
| `missions` | 멤버 | 생성: `whoCanHost` (개인 목표 `isPersonal`이면 모든 멤버) && `uid() in hostIds` / 수정: 진행자 (`participantIds`는 서버) |
| `submissions` | 본인, 보호자, `reviewerUids`, `peerReviewerUids` | 본인: `content`·`attachments`·`status → submitted` (체크형은 `done`) / 승인·반려는 서버 (`reviewSubmission`) |
| `peerReviews` | 검토자, 제출자, 진행자 | 서버 |

### 테스트 · 수학
| 경로 | 읽기 | 쓰기 |
| --- | --- | --- |
| `questions` | 작성자·공동 출제자, 또는 `sharing == 'space'`면 멤버 | `whoCanCreate`, 수정은 출제자 |
| `questionKeys` | `uid() in authorIds`, 또는 `answerVisibility == 'space'`면 멤버 | 출제자 (`authorIds`는 서버) |
| `problemSets` | 작성자, 또는 `visibility == 'space'`면 멤버 | `whoCanCreate`, 수정은 작성자. `editPolicy == 'members'`인 공개 문제집은 멤버가 `questionIds`만 |
| `problemAttempts` | 본인 (`{uid}_` 문서 id) | 서버만 (`drawProblem`·`checkProblem`·`revealHint`) |
| `problemNotes` | 본인 | 본인 (`{uid}_{questionId}`, 5000자) |
| `tests` | 멤버 (대상 아닌 경우 목록만) | 생성 `whoCanHost`, 수정 진행자 |
| `attempts` | 본인, 보호자, `hostIds` | 본인: 마감 전 `answers`만 / 그 외 서버 |
| `answerAppeals` | 신청자, 출제자 | 생성 본인 / 처리 서버 |
| `curricula` | 로그인 사용자 | 없음 |

## 4. Storage 규칙
```
match /b/{bucket}/o {
  function member(sid) {
    return firestore.exists(/databases/(default)/documents/spaces/$(sid)/members/$(request.auth.uid));
  }
  match /spaces/{sid}/files/{ownerUid}/{fileId}/{name} {
    allow read: if request.auth != null && (member(sid) || ownerUid in request.auth.token.get('wards', []));
    allow create: if request.auth != null && request.auth.uid == ownerUid && member(sid)
      && request.resource.size < 500 * 1024 * 1024
      && request.resource.contentType.matches('image/.*|audio/.*|video/.*|application/pdf|application/.*|text/.*');
    allow delete: if request.auth != null && request.auth.uid == ownerUid;
  }
  match /spaces/{sid}/derived/{path=**}       { allow read: if request.auth != null && member(sid); }
  match /spaces/{sid}/pageVersions/{path=**}  { allow read: if false; }   // 서버 경유
  match /users/{uid}/avatar/{name} {
    allow read: if request.auth != null;
    allow write: if request.auth != null && request.auth.uid == uid && request.resource.size < 5 * 1024 * 1024;
  }
}
```
- 계정당 총량(2GB)은 규칙으로 막을 수 없다 → 업로드 전 클라이언트가 `users.storage`로 확인하고, 서버 `registerUpload`가 초과 업로드를 지우고 거절한다. 아이 계정(`wards` 클레임) 읽기는 2-F5에서.
- 비공개 노트의 첨부 파일까지 엄격히 막으려면 파일 경로에 페이지를 넣고 `firestore.get()`으로 공개 범위를 확인해야 한다 → 3단계에서 검토 (현재는 같은 공간 멤버면 파일 주소를 알 때 읽을 수 있음).

## 5. 커스텀 클레임
| 클레임 | 값 | 설정 |
| --- | --- | --- |
| `wards` | 보호 중인 아이 uid 배열 | `createChildAccount`, `acceptGuardianInvite` |
| `child` | `true` | 아이 계정 커스텀 토큰 |

- 클레임 변경 후 클라이언트는 토큰을 새로 받아야 한다(`getIdToken(true)`).
- 클레임 크기 한도(1,000바이트) → 보호자 1명당 아이 약 25명까지. 충분하다고 본다.

## 6. 규칙 테스트
- `@firebase/rules-unit-testing` + 에뮬레이터. 새 컬렉션을 추가하면 테스트 필수.
- 테스트 행렬: **관계 × 컬렉션**
  - 비로그인 / 비멤버 / 멤버 / 작성자 / 공동 편집자 / 진행자 / 리뷰어 / 피드백 요청받은 사람 / manager / owner / 보호자 / 나간 멤버
- 꼭 넣을 경우:
  - manager가 남의 비공개 노트·숨긴 진도를 못 보는지
  - 보호자가 아이의 비공개 노트를 보는지, 다른 아이 것은 못 보는지
  - 내 공간에 다른 사람이 접근 못 하는지, 내 공간 노트를 `private` 외로 못 바꾸는지
  - 진행자이자 참여자가 자기 제출을 승인 못 하는지
  - 나간 멤버의 노트가 다른 멤버에게 안 보이는지
  - 편집 잠금 중 다른 사람의 블록 쓰기가 막히는지

## 7. 리뷰 질문
- 없음

## 8. 변경 이력
- v2.10: `wrongNotes` 본인 직접 해결·되돌리기
- v2.9: `wrongNotes` 규칙 적용 (본인 읽기, 서버만 씀)
- v2.8: 단원별 만들기(`saveGenerated`): 서버가 `whoCanCreate`·문제집 편집 권한을 확인하고, 정답을 볼 수 없던 틀의 복사본은 정답 문서를 원래 출제자만 읽는다
- v2.7: 문제집 풀이 기록 `problemAttempts`(서버만 씀)·풀이 메모 `problemNotes`, `questionKeys.hints`, `problemSets.hintPenalty`
- v2.5: `invites` 규칙 적용, 생성은 서버(코드 유일성)
- v2.4: `spaces` 수정 규칙 적용(바꿀 수 있는 필드·값 검사)
- v2.3: 1차 일부 적용(users·spaces·members 읽기)
- v2.2: 블록 쓰기 규칙 읽기 횟수 검증 결과 반영
- v2.1: 확정 — 비공개 노트 첨부 파일 보호는 3단계에서
- v2.0: 확정 기능명세 기준으로 새로 작성
- v2.6: Storage 규칙 적용(같은 공간 활성 멤버 읽기, 본인 폴더에만 올리기, 500MB·형식 제한), `users/{uid}/uploads` 본인 읽기
