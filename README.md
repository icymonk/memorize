# memorize

여러 명이 **워크스페이스**로 모여 외국어·독서·수학 등 다양한 학습 활동을 함께 만들고, 기록하고, 서로의 진행 상황을 확인하는 그룹 학습 서비스.

- 앱: Nuxt 5 nightly SPA (`ssr: false`) + shadcn-vue + Tailwind v4
- 백엔드: Firebase (Auth · Firestore · Storage · Hosting · Cloud Functions 2nd gen), 리전 `asia-northeast3`

## 문서

| 위치 | 내용 |
| --- | --- |
| [docs/README.md](./docs/README.md) | 문서 목차와 상태 |
| [docs/planning/](./docs/planning/) | 서비스 개요, 역할, 출시 단계, 결정 사항 |
| [docs/features/](./docs/features/) | 기능명세 (기능 ID: `WS`, `VOC`, `NOTE` …) |
| [docs/dev/](./docs/dev/) | 개발 문서 (아키텍처, 데이터 모델, 보안 규칙, 작업 분해) |
| [AGENTS.md](./AGENTS.md) | 작업 규칙 요약 (에이전트·개발자 공용) |

현재 진행 상황은 [docs/dev/phase-plan.md](./docs/dev/phase-plan.md) 참고.

## 시작하기

Node 22, pnpm 10 필요 (npm 사용 금지).

```bash
pnpm install
cp .env.example .env   # NUXT_PUBLIC_FIREBASE_* 값 채우기
pnpm dev               # http://localhost:3000
```

## 명령

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 개발 서버 |
| `pnpm test` | 단위 테스트 (Vitest) |
| `pnpm typecheck` | 앱 + Functions 타입 검사 |
| `pnpm functions:build` | Cloud Functions 번들 → `functions/lib` |
| `pnpm generate` | 정적 빌드 → `.output/public` (Firebase Hosting) |
| `pnpm emulators` | Firebase 에뮬레이터 (Firestore 에뮬레이터는 Java 21+ 필요) |

## 폴더 구조

```
app/        Nuxt 앱 (pages, layouts, components, stores, plugins)
shared/     앱·서버 공용 순수 코드 (#shared 로 import)
functions/  Cloud Functions (pnpm 워크스페이스 패키지)
docs/       기획·기능명세·개발 문서
```

## CI

GitHub Actions(`.github/workflows/ci.yml`)가 PR과 `main` push마다 `test`, `typecheck`, `functions:build`, `generate`를 실행합니다.
