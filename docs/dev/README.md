# 개발 문서

> 상태: 확정 · v2.3 · 2026-10-12 — 확정된 기능명세(`docs/planning`, `docs/features`) 기준으로 새로 작성

기능명세가 "무엇을"이라면 이 폴더는 "어떻게"다. 기능명세와 충돌하면 **기능명세가 우선**이고, 이 문서를 고친다.

## 문서

| 문서 | 내용 | 상태 |
| --- | --- | --- |
| [architecture.md](./architecture.md) | 전체 구조, "공간(space)" 개념, 클라이언트/서버 경계, 폴더 구조 | 확정 |
| [data-model.md](./data-model.md) | Firestore 컬렉션·필드, Storage 경로, 인덱스 | 확정 |
| [editor.md](./editor.md) | 블록 편집기와 블록 단위 저장·동기화 | 확정 |
| [functions.md](./functions.md) | 서버 기능(Cloud Functions) 목록과 동작 | 확정 |
| [security.md](./security.md) | Firestore·Storage 보안 규칙 | 확정 |
| [routing.md](./routing.md) | 화면 경로, 레이아웃, 접근 제어 | 확정 |
| [conventions.md](./conventions.md) | 개발 환경, 코드 규칙, 테스트, 배포, 모니터링 | 확정 |
| [phase-plan.md](./phase-plan.md) | 0~1단계 작업 분해 | 확정 |
| [phase2-plan.md](./phase2-plan.md) | 2단계 작업 분해 | 확정 |
| [spikes.md](./spikes.md) | 기술 검증 S1~S5 결과 (`spikes/`) | 검증 |

## 개발 결정

### 확정 (사용자 결정)
| # | 항목 | 결정 |
| --- | --- | --- |
| D1 | 서버 기능 도입 시점 | **0단계부터** Cloud Functions 사용 (Firebase Blaze 요금제) |
| D2 | 노트 저장 방식 | **블록마다 문서 1개** → [editor.md](./editor.md) |
| D3 | 책 검색 | **카카오 책 검색 + Google Books 보조** (서버 기능을 거쳐 호출, 키 비공개) |
| D4 | 웹 오류 추적 | **Sentry** (`@sentry/vue`, 클라이언트 전용) |

### 추천안 (채택)
| # | 항목 | 추천 | 이유 |
| --- | --- | --- | --- |
| R1 | 내 공간 구현 | 내 공간을 **멤버 1명짜리 특수 공간**으로 만든다 (`kind: 'personal'`) | 단어장·노트 코드를 워크스페이스와 100% 공유, 복사도 "공간 → 공간" 하나로 처리 |
| R2 | Firestore 바인딩 | VueFire 대신 **얇은 자체 composable** | Nuxt 5 nightly 호환성 위험 회피, 블록 동기화 등 세밀한 제어 필요 |
| R3 | 간격 반복 알고리즘 | **SM-2 단순화판** (4단계 평가 → 간격·난이도 계수) | 기능명세 "단순한 방식으로 시작" |
| R4 | 문서 파일 미리보기 | 초기: **PDF·이미지·오디오·영상만 화면 안 보기**, 한글·워드·파워포인트·엑셀은 내려받기. 이후: 서버에서 PDF로 변환해 미리보기 | 외부 뷰어(Office Online 등)는 파일을 공개 URL로 열어야 해서 비공개 자료에 부적합 |
| R5 | 무료 한도 값 | 워크스페이스 최대 **100명**, 계정당 업로드 **2GB** | "무료에서 최대한 넉넉하게". 값은 설정 상수로 두고 운영 중 조정 |
| R6 | 서버 리전 | Functions·Firestore·Storage 모두 **서울(asia-northeast3)** | 사용자 대부분이 국내 |
| R7 | 아이 계정 로그인 | 서버 기능이 로그인 코드를 확인하고 **커스텀 토큰**을 발급 | 이메일 없는 계정을 Firebase Auth로 처리하는 표준 방식 |

## 추가 결정 (리뷰 반영)
| # | 항목 | 결정 |
| --- | --- | --- |
| D5 | 패키지 관리자 | **pnpm** |
| D6 | 저장소 | Git. `main`(운영) ← `develop`(기본 브랜치) ← 기능 브랜치 |
| D7 | 내 공간 범위 | 단어장·노트·모음 + **개인 독서·독후감** |
| D8 | 초대 메일 | Firebase Auth 이메일 링크 우선, 필요 시 Trigger Email + 무료 SMTP |
| D9 | Firebase 프로젝트 | `memorize-c6c1b` (dev 겸용, Blaze 전환 예정) |
| D10 | 비공개 노트 첨부 파일 보호 | 3단계에서 |
| D11 | DB 선택 | **Firestore 유지** (SQL Connect 검토 후). 이유: 고정비 없음(무료 최대 지원 방향), 오프라인 동기화, 실시간·트리거 중심 설계. 통계·추천이 무거워지는 3~4단계에 BigQuery 내보내기 또는 SQL Connect 부분 도입을 다시 검토. S1 검증 결과가 나쁘면 재판단 |

## 변경 이력
- v2.3: 2단계 작업 분해(phase2-plan.md) 추가
- v2.2: D6 브랜치 전략 `main` ← `develop` ← 기능 브랜치
- v2.1: 리뷰 반영·확정
- v2.0: 확정 기능명세 기준으로 새로 작성
