# 기술 검증 결과 (S1~S5)

> 상태: 검증 · v1.0 · 2026-10-12 — [phase-plan.md](./phase-plan.md) "먼저 할 검증"의 결과. 검증 코드는 `spikes/`(앱과 분리된 독립 pnpm 프로젝트).

## 요약
| # | 결과 | 설계 변경 | 실제 프로젝트에서 남은 확인 |
| --- | --- | --- | --- |
| S1 | **통과** (에뮬레이터) | 없음. 묶음은 한 페이지 단위 유지 | 0-8 규칙 배포 후 실제 환경에서 1회 확인 |
| S2 | **통과** (단위 테스트 + Nuxt 5 빌드·브라우저) | 없음. 구현 시 주의점 3가지 | — |
| S3 | **통과** (규칙, 에뮬레이터) | 없음 | 에뮬레이터는 인덱스를 검사하지 않음 → 인덱스 배포 후 실제 쿼리 1회 |
| S4 | **통과** (Auth 에뮬레이터) + 문서 확인 | 없음 | 2nd gen 실행 서비스 계정에 "서비스 계정 토큰 생성자" 역할 부여 |
| S5 | **통과** (공식 문서) | 없음 | 프로젝트의 Firestore·Storage가 실제로 `asia-northeast3`인지 콘솔 확인 |

## 실행 방법
```bash
cd spikes
pnpm install                 # 앱 lockfile과 분리된 별도 설치
pnpm test:editor             # S2
pnpm test:rules              # S1·S3·S4 (Firestore·Auth 에뮬레이터, Java 21+ 필요)
```

## S1 — 블록 묶음 쓰기와 규칙 문서 읽기 한도
security.md의 헬퍼·`pages`·`blocks` 규칙을 그대로 옮겨(`spikes/firestore.rules`) 테스트했다.

| 경우 | 결과 |
| --- | --- |
| 대조군: 쓰기 1건에 서로 다른 문서 10개 읽기 / 11개 읽기 | 허용 / **거부** → 에뮬레이터가 한도를 실제로 적용함 |
| 한 페이지에 블록 1·10·50·399개 + 페이지 메타 1건 | 모두 허용 |
| 한 페이지에 499개 + 메타 (최대 묶음 500건) | 허용 |
| 잠긴 페이지: 잠금 보유자 / 다른 편집자 | 허용 / 거부 |
| 한 묶음에 페이지 9개·18개의 블록 | 허용 |
| 한 묶음에 페이지 19개·25개의 블록 | **거부** |

- 같은 문서를 읽는 호출은 묶음 전체에서 한 번만 센다. 그래서 한 페이지 묶음은 블록 수와 관계없이 읽기가 일정하다(멤버 문서 + 페이지 문서).
- 페이지 18개(허용)와 19개(거부)의 경계로 보아, 같은 멤버 문서라도 `exists()`와 `get()`은 따로 세는 것으로 보인다(18 + 2 = 20). `isMember`에서 `exists()`를 빼고 `get()`만 써도 결과가 같으므로 0-8에서 정리하면 한도 여유가 1 늘어난다.
- 결론: editor.md의 "페이지마다 최대 400건 묶음"은 그대로 둔다. 한 묶음에 여러 페이지를 섞지 않는다.

## S2 — Tiptap 3 + 평평한 목록 블록 + UniqueID
`@tiptap/*` 3.31.4. 목록 블록은 `bulletItem`/`todoItem`/`toggle` = `itemLine block*`(첫 줄 + 자식 블록)으로 정의했다(`spikes/editor/flat-list.ts`).

- 단위 테스트(happy-dom) 8개 통과: 중첩 블록까지 ID 부여, 목록에서 Enter 시 새 ID, 문단 나누기, 클립보드 붙여넣기 시 새 ID, 들여쓰기(이전 블록의 자식으로 이동) 시 ID 유지, 실행 취소 시 원래 ID 복원, 문서 → 블록 문서 → 문서 왕복이 같은 결과.
- Nuxt 5 nightly 앱에 임시 페이지(`@tiptap/vue-3`의 `useEditor`·`EditorContent`)를 넣어 `pnpm generate` 성공, Chrome에서 Enter·복사·붙여넣기 후 블록 10개 모두 서로 다른 ID, 콘솔 오류 없음. 임시 페이지는 저장소에 넣지 않았다.

구현 시 주의점:
1. UniqueID는 첫 내용에 ID를 **에디터 `create` 이벤트(비동기)** 에서 붙인다. 저장된 블록을 불러올 때는 이미 ID가 있으므로 문제없지만, 생성 직후 동기적으로 `getJSON()`을 읽으면 ID가 비어 있다.
2. 코드로 넣는 내용(블록 복제, 템플릿, 다른 페이지에서 가져오기)에 ID가 남아 있으면 **중복을 고치지 않는다**(실제 붙여넣기만 ID를 지움). 코드로 넣을 때는 ID를 지우고, 저장 직전 변경 찾기 단계에서 중복 ID를 검사한다.
3. 자식이 있는 항목 끝에서 Enter를 누르면 ProseMirror 기본 동작(`splitListItem`)으로 **자식이 새 형제 항목 밑으로 옮겨진다**. 노션처럼 "새 항목이 첫 자식이 되는" 동작은 flat-list 확장에서 Enter를 직접 처리해야 한다.
- StarterKit 3에는 `bulletList`·`orderedList`·`listItem`·`listKeymap`·`trailingNode` 등이 들어 있으므로 평평한 목록을 쓸 때는 끈다.

## S3 — `collectionGroup('cardStates')`
- 규칙 `match /{path=**}/cardStates/{id} { allow read: if signedIn() && resource.data.uid == uid(); }`로:
  - 내 공간 + 워크스페이스 2곳에 흩어진 내 복습 카드를 `where uid == me, due <= now, orderBy due`로 한 번에 읽음 (허용)
  - `uid` 조건이 없는 쿼리, 남의 `uid` 쿼리, 비로그인: 거부
- 필요한 인덱스: 컬렉션 그룹 범위 `cardStates (uid ASC, due ASC)` — `spikes/firestore.indexes.json`. 에뮬레이터는 인덱스를 검사하지 않으므로 실제 프로젝트 배포 후 확인한다. 0-8에서 루트 `firestore.indexes.json`에 넣는다.

## S4 — 2nd gen 서버 기능에서 커스텀 토큰
- Admin SDK(`firebase-admin` 14.5) `createCustomToken` → 클라이언트 `signInWithCustomToken` → 커스텀 클레임 확인까지 Auth 에뮬레이터에서 통과. `setCustomUserClaims`(보호자 `wards`)도 토큰 갱신 후 반영.
- 공식 문서([Create custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens)): 2nd gen은 **기본 Compute Engine 서비스 계정**으로 실행되고, 토큰 서명에 `iam.serviceAccounts.signBlob` 권한이 필요하다. 없으면 `Permission iam.serviceAccounts.signBlob is required…` 오류 → 해당 서비스 계정에 **Service Account Token Creator** 역할을 준다.
- 결론: 1st gen으로 나눌 필요 없음. 0-2(Firebase 설정)에 IAM 역할 부여를 추가한다. 가능하면 `childSignIn` 전용 서비스 계정을 만들어 그 계정에만 역할을 준다.

## S5 — 서울 리전
- [Cloud Functions 위치](https://cloud.google.com/functions/docs/locations): `asia-northeast3`(서울) 지원, **Tier 2 요금**.
- [Eventarc 위치](https://cloud.google.com/eventarc/docs/locations): 2nd gen 트리거의 기반인 Eventarc가 `asia-northeast3` 지원.
- [Firestore 위치](https://firebase.google.com/docs/firestore/locations): `asia-northeast3` 지원. Firestore 트리거는 함수와 DB 위치가 멀면 지연이 커지므로 같은 리전에 둔다.
- [Storage 트리거](https://firebase.google.com/docs/functions/gcp-storage-events): 함수 위치가 버킷 위치와 다르면 **배포가 실패할 수 있다** → 버킷도 `asia-northeast3`여야 한다.
- [Storage 위치](https://firebase.google.com/docs/storage/locations): 버킷 위치는 만든 뒤 바꿀 수 없다. 무료 등급("Always Free")은 US 리전만 해당하고 서울 버킷은 일반 GCS 요금(Blaze 필요).
- 결론: 모든 트리거를 서울에 둘 수 있다. 단, **기본 버킷과 Firestore DB를 서울로 만들어야** 하며 이것만 콘솔에서 확인하면 된다.

## 환경 메모
- Firestore 에뮬레이터는 Java 21+가 필요하다. Ubuntu 기본 저장소에 `openjdk-21`이 없어 Temurin 21 JRE를 직접 받아 썼다.
- 루트 워크스페이스에서 새 패키지를 추가하는 `pnpm install`(lockfile 재해석)이 의존성 해석 중(약 1,350개 지점) 멈추는 현상이 있었다. `--frozen-lockfile` 설치는 정상. 그래서 검증 코드는 루트 lockfile을 건드리지 않는 독립 프로젝트로 두었다. 1단계에서 앱에 Tiptap을 추가할 때 다시 확인이 필요하다.

## 변경 이력
- v1.0: S1~S5 검증 결과
