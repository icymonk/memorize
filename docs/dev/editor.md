# 블록 편집기 · 블록 단위 저장

> 상태: 확정 · v2.2 — 결정 D2: 블록마다 문서 1개

노트·학습일지·독후감·내 모음·강의 본문이 쓰는 편집기. 기능은 [features/notes.md](../features/notes.md).

## 1. 구성
| 요소 | 선택 |
| --- | --- |
| 편집기 | Tiptap 3 (`@tiptap/vue-3`, `@tiptap/pm`, `@tiptap/starter-kit`) |
| 블록 ID | `@tiptap/extension-unique-id` — 노드를 나누고 합치고 붙여넣어도 ID를 유지 |
| 순서 | fractional-indexing (`order` 문자열) |
| 그 밖의 확장 | placeholder, task-list/task-item, image, link, table, highlight, color, text-style, underline, code-block-lowlight, typography, character-count, mention, drag-handle-vue |

> 설치 전 Nuxt 5 nightly·Vue 3.5와의 호환, 게시일(7일 이상) 확인.

## 2. 블록 모델

### 2.1 무엇이 "블록"인가
편집기 문서(ProseMirror 트리)의 **블록 노드 하나 = Firestore 문서 하나**. 블록 노드는 UniqueID를 가진다.

| 분류 | 블록 타입 | 안에 담는 것 | 기능 ID |
| --- | --- | --- | --- |
| 텍스트 | `paragraph`, `heading`, `quote`, `callout`, `divider` | 인라인 텍스트 (divider 제외) | NOTE-02 |
| 목록 | `bulletItem`, `numberedItem`, `todoItem`, `toggle` | 인라인 텍스트 + **자식 블록** | NOTE-03 |
| 미디어 | `image`, `file`, `bookmark`, `video` | attrs만 | NOTE-04 |
| 코드·수식 | `codeBlock`, `math` | 텍스트 / 수식 문자열 | NOTE-05 |
| 구조 | `table`(표 전체가 블록 1개), `columns` → `column` | 표: attrs에 셀 / 열: 자식 블록 | NOTE-06 |
| 연결 | `pageLink`, `appEmbed`, `todaySummary`, `bookQuote` | attrs (refType, refId …) | NOTE-07 |
| 학습 | `flashcard` | 앞/뒤 인라인 텍스트 | NOTE-08 |
| 그리기 | `drawing` | attrs: `fileId`(획 데이터 JSON은 Storage), 미리보기 이미지 | NOTE-11 |

- 목록은 Tiptap 기본(`bulletList > listItem > paragraph`) 대신 **평평한 목록 블록 + 들여쓰기 = 자식 블록** 방식(노션식)으로 만든다. 블록 경계가 분명해져 저장 단위와 1:1로 맞는다.
- 표는 셀 단위로 나누지 않는다 (작은 표 위주, 쪼개면 비용만 늘어남).

### 2.2 문서 모양
```
spaces/{sid}/pages/{pageId}/blocks/{blockId}
  type, parentBlockId | null, order, attrs, content, rev, updatedBy, updatedAt
```
`content`는 인라인 노드 배열(ProseMirror JSON의 `text` + `marks`, `mention` 등).

## 3. 불러오기
1. 페이지 메타를 읽고 권한·잠금 상태 확인.
2. `blocks`를 `order`로 한 번에 읽는다 (블록 2,000개 넘으면 경고 — [data-model.md](./data-model.md#14-한도-상수-r5)).
3. `parentBlockId`로 트리를 만들고 ProseMirror 문서로 바꿔 `setContent(…, { emitUpdate: false })`.
4. 블록마다 "마지막으로 저장된 모양"(직렬화 해시)을 메모리에 보관 → 변경 감지 기준.

## 4. 저장 (동기화)
```
편집 → (0.8초 쉬면) 변경 블록 찾기 → 쓰기 묶음(batch) → 저장 상태 표시
```
1. **변경 찾기**: 현재 문서를 블록 목록으로 펼쳐 블록 ID별 해시를 이전과 비교
   - 새 ID → 생성, 사라진 ID → 삭제, 해시가 다름 → 수정
   - 위치가 바뀐 블록만 새 `order`를 계산 (앞뒤 블록 `order` 사이 값). 나머지 블록의 `order`는 건드리지 않는다.
2. **쓰기**: `writeBatch`로 묶어서 쓴다. 한 번에 최대 400건, 넘으면 나눈다. 같은 묶음에 페이지 메타(`excerpt`, `blockCount`, `textLength`, `updatedAt`)도 갱신.
3. **즉시 저장**: 페이지를 떠나거나 탭이 가려질 때(`visibilitychange`) 기다리지 않고 바로 저장.
4. **오프라인**: Firestore 로컬 캐시에 쌓였다가 연결되면 전송. 화면에는 "오프라인 — 연결되면 저장".
5. **붙여넣기·대량 변경**: 수백 블록이 한꺼번에 생기면 순서 키를 그 구간만 다시 고르게 배치.
6. **블록 크기**: 텍스트 10,000자 초과 블록은 저장 전 나누라고 안내 (문서 1MiB 한도 보호).
7. **이미지·파일**: 붙여넣기/끌어놓기 → 자리 표시 블록 → Storage 업로드 → `fileId`로 교체. 블록 안에 파일 내용을 넣지 않는다.

## 5. 함께 보기 · 함께 편집
### 초기 (NOTE-60): 한 번에 한 명 편집
- 편집 시작 시 페이지에 `lock: { uid, at }` 기록, 30초마다 갱신, 90초 넘게 갱신 없으면 만료.
- 다른 사람은 읽기 전용 + "○○님이 편집 중". 읽는 사람은 `blocks`를 실시간 구독해 **편집 내용을 바로 본다** (블록 단위 저장 덕분에 바뀐 블록만 다시 그림).
- 잠금이 만료된 뒤 이전 편집자의 늦은 저장이 오면: 블록 `rev`를 비교해 충돌 블록만 "다른 사람이 수정했습니다" 표시 후 선택(내 것 유지 / 최신 불러오기).

### 이후 (NOTE-64): 실시간 공동 편집
블록 단위 저장이라 단계적으로 갈 수 있다.
1. 잠금을 **블록 단위**로: 다른 사람이 편집 중인 블록만 잠그고 나머지는 동시에 편집.
2. 원격 변경은 블록 ID로 찾아 그 노드만 바꾼다 (실행 취소 기록에 넣지 않음).
3. 같은 블록 동시 입력까지 필요하면 그때 Yjs 등 CRDT를 블록 내용에 도입 검토.

## 6. 버전 기록 (NOTE-63)
- 편집 잠금이 풀릴 때, 또는 편집 중 10분마다 서버 기능이 블록 전체를 JSON 스냅샷으로 Storage에 저장하고 `versions` 문서를 만든다.
- 되돌리기: 서버 기능이 스냅샷 기준으로 블록을 다시 쓴다 (현재 상태도 먼저 스냅샷).

## 7. 복사 (NOTE-27, WS-60~64)
- 서버 기능 `copyContent`가 블록을 나눠 읽고 새 공간에 새 ID로 쓴다. 하위 페이지 포함.
- 볼 권한이 없는 연결 블록(`appEmbed`, `pageLink`)은 빼고, 파일은 Storage에서 복사본을 만든다.

## 8. 연결 블록
| 블록 | attrs | 동작 |
| --- | --- | --- |
| `appEmbed` | `refType` (deck, book, test, mission, course …), `refId` | 대상 문서를 읽어 카드로 표시. 권한이 없으면 "볼 수 없는 항목", 없으면 "삭제된 항목" |
| `todaySummary` | `uid`, `date`, `subjectId?` | `dailySummaries/{uid}_{date}`를 구독해 표시. 하루 마감 후에는 고정본 |
| `bookQuote` | `quoteId` | 구절 표시 (REV-05) |
| `pageLink` | `pageId` | 제목·아이콘 표시, 역링크 대상 (서버가 `pageLinks` 갱신) |

## 9. 사용처별 설정 (프리셋)
| 프리셋 | 사용처 | 허용 블록 |
| --- | --- | --- |
| `note` | 노트, 모음 페이지, 강의 본문 | 전체 |
| `journal` | 학습일지 | 전체 + `todaySummary` 자동 삽입 |
| `review` | 독후감 | 전체 + `bookQuote` |
| `inline` | 문제 지문·해설, 미션 설명 | 텍스트·목록·이미지·수식 (블록 문서로 나누지 않고 부모 문서 필드에 JSON으로 저장) |
| `comment` | 댓글 | 글자 꾸미기·멘션만 |

> `inline` 프리셋은 내용이 작아 블록 단위 저장의 이점이 없으므로 부모 문서에 통째로 저장한다.

## 10. 화면 구조
```
features/notes/
  components/
    BlockEditor.vue        # props: spaceId, pageId, preset, editable
    InlineEditor.vue       # inline/comment 프리셋 (단일 필드 저장)
    SlashMenu.vue          # '/' 블록 메뉴 (shadcn Command)
    BubbleMenu.vue         # 선택 시 글자 꾸미기
    BlockHandle.vue        # 끌기 손잡이 + 블록 메뉴
    nodes/                 # AppEmbed, TodaySummary, BookQuote, Drawing, Flashcard, Callout …
  sync/
    serialize.ts           # 문서 ↔ 블록 목록 변환 (순수 함수, 단위 테스트 대상)
    diff.ts                # 해시 비교 → 생성/수정/삭제/순서 변경
    writer.ts              # 묶음 쓰기, 디바운스, 즉시 저장
    remote.ts              # 실시간 구독 → 편집기 반영
    lock.ts                # 편집 잠금
  extensions/              # slash-command, flat-list, page-link, image-upload …
```
- `serialize.ts`, `diff.ts`는 Firebase에 의존하지 않는 순수 코드로 두고 테스트를 촘촘히 쓴다 (나누기·합치기·들여쓰기·붙여넣기·실행 취소 경우).

## 11. 비용 추정 (참고)
| 동작 | 읽기 | 쓰기 |
| --- | --- | --- |
| 블록 200개 페이지 열기 | 201 | 0 |
| 한 문장 고치고 저장 | 0 | 2 (블록 1 + 페이지 메타 1) |
| 블록 하나 옮기기 | 0 | 2 |
| 다른 사람이 보는 중 내가 한 블록 수정 | 보는 사람마다 1 | — |

목록·캘린더·표 보기는 페이지 메타만 읽으므로 블록 수와 무관하다.

## 12. 확인 필요
- ~~블록 쓰기의 규칙 `get()` 횟수 한도~~ → **검증 완료(S1)**: 같은 문서 읽기는 묶음 전체에서 한 번만 세므로 한 페이지 묶음은 500건까지 통과. 한 묶음에 여러 페이지를 섞지 않는다 ([spikes.md](./spikes.md#s1--블록-묶음-쓰기와-규칙-문서-읽기-한도)).
- Tiptap 3 구현 주의점(S2): 코드로 넣는 내용은 ID를 지우고 저장 전 중복 ID 검사, 자식 있는 항목에서 Enter는 직접 처리 ([spikes.md](./spikes.md#s2--tiptap-3--평평한-목록-블록--uniqueid)).

## 13. 리뷰 질문
- 없음

## 14. 변경 이력
- v2.2: 12절 S1·S2 검증 결과 반영
- v2.1: 확정 — 노션식 평평한 목록 블록 동의
- v2.0: 확정 기능명세 기준으로 새로 작성
