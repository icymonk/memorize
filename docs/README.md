# memorize 문서

그룹(워크스페이스) 기반 통합 학습 플랫폼 **memorize**의 기획 문서 모음.

## 진행 방식

1. **기능명세 작성** — `planning/`, `features/` 문서를 작성한다. 개발 관점(데이터 구조, 기술 선택)은 넣지 않는다.
2. **리뷰** — 문서별로 읽고, 각 문서 맨 아래 **리뷰 질문**에 답하거나 기능 ID(예: `VOC-03`)를 지정해 수정 요청한다.
3. **확정** — 리뷰가 끝난 문서는 상태를 `확정`으로 바꾼다. 확정 후 변경은 문서 하단 변경 이력에 남긴다.
4. **개발 문서 작성** — 모든 기능명세가 확정되면 `dev/` 문서를 확정된 명세 기준으로 다시 작성한다.

> 기획 문서는 **모두 확정**(2026-10-06). 개발 문서도 **확정**(v2.1)되었다. 다음은 0단계 개발 → [dev/README.md](./dev/README.md).

## 문서 상태

| 문서 | 내용 | 상태 |
| --- | --- | --- |
| [planning/overview.md](./planning/overview.md) | 서비스 개요, 목표, 모듈 지도 | 확정 |
| [planning/users-and-roles.md](./planning/users-and-roles.md) | 역할 모델 (고정 역할 없음) | 확정 |
| [planning/roadmap.md](./planning/roadmap.md) | 출시 단계, 성공 지표 | 확정 |
| [planning/open-questions.md](./planning/open-questions.md) | 결정 사항 기록 | 확정 |
| [features/workspace.md](./features/workspace.md) | 워크스페이스 · 멤버 · 초대 · 그룹 · 내 공간 · 복사 | 확정 |
| [features/account.md](./features/account.md) | 계정 · 프로필 · 개인 설정 | 확정 |
| [features/common.md](./features/common.md) | 홈 · 활동 피드 · 댓글/피드백 · 알림 · 포인트 · 검색 | 확정 |
| [features/notes.md](./features/notes.md) | 노트 · 학습일지 (노션형 기록) | 확정 |
| [features/vocab.md](./features/vocab.md) | 외국어 학습 (Quizlet형) | 확정 |
| [features/courses.md](./features/courses.md) | 강의자료 (모든 과목 공용) | 확정 |
| [features/reading.md](./features/reading.md) | 독서 (책장 · 독서 기록 · 함께 읽기) | 확정 |
| [features/book-reviews.md](./features/book-reviews.md) | 독후감 | 확정 |
| [features/missions.md](./features/missions.md) | 미션 | 확정 |
| [features/tests.md](./features/tests.md) | 테스트 | 확정 |
| [features/math.md](./features/math.md) | 수학 공부 | 확정 |
| [features/wrong-notes.md](./features/wrong-notes.md) | 통합 오답 노트 | 확정 |

상태: `초안` → `리뷰 중` → `확정`

### 추천 리뷰 순서
1. `planning/overview.md`, `planning/users-and-roles.md` — 전체 방향과 역할 모델이 먼저 확정되어야 나머지가 흔들리지 않는다.
2. `features/workspace.md`, `features/account.md`, `features/common.md` — 모든 모듈이 기대는 공통 기반.
3. `features/notes.md` — 독후감·강의 필기·학습일지가 이 위에 올라간다.
4. 학습 모듈: `vocab` → `reading` → `book-reviews` → `missions` → `tests` → `courses` → `math` → `wrong-notes`
5. `planning/roadmap.md`, `planning/open-questions.md` — 마지막에 범위와 순서를 확정.

## 기능명세 작성 규칙
- 모든 기능 문서는 같은 목차를 따른다:
  **목적 → 사용자 스토리 → 용어 → 기능 명세(ID) → 화면 구성 → 권한 → 예외 상황 → 출시 단계 → 리뷰 질문 → 변경 이력**
- 기능마다 **ID**를 붙인다 (`WS`, `ACC`, `CMN`, `NOTE`, `VOC`, `CRS`, `READ`, `REV`, `MIS`, `TST`, `MATH`, `WRN` + 번호). 리뷰·수정 요청 시 ID로 가리킨다.
- 사용자 관점으로 쓴다. 저장 방식, 기술 이름, 필드명은 쓰지 않는다.
- 문서 간 겹치는 내용은 한 곳에만 쓰고 나머지는 링크한다.
