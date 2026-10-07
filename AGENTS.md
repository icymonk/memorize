# memorize

Nuxt 5 nightly (`npm:nuxt-nightly@5x`) SPA (`ssr: false`) + shadcn-vue + Firebase (Hosting / Firestore / Storage).

## Docs
- 기획 문서는 `docs/` (목차·문서 상태: `docs/README.md`). 기본 기획 `docs/planning/`, 기능명세 `docs/features/`.
- 진행 순서: 기능명세 작성 → 리뷰 → 확정 → 그 다음 개발 문서. 기획·기능명세는 **모두 확정**됨(2026-10-06). 개발 문서 `docs/dev/`(v2.1)도 확정. 목차·개발 결정은 `docs/dev/README.md`.
- 데이터 구조의 원본은 `docs/dev/data-model.md`. 기능명세와 개발 문서가 충돌하면 기능명세가 우선.
- 핵심 설계: 워크스페이스와 내 공간은 모두 `spaces/{spaceId}`(내 공간은 `p_{uid}`). 노트는 블록마다 문서 1개.
- 확정 문서를 바꿀 때는 문서 상단 버전을 올리고 변경 이력에 남긴다.
- 기능명세에는 개발 용어(저장 방식, 기술명, 필드명)를 쓰지 않는다. 기능마다 ID(`VOC-01` 등)를 붙인다.

## Commands
- Package manager: **pnpm** (npm 사용 금지, `package-lock.json` 만들지 않기)
- Dev: `pnpm dev`
- Static build (for Firebase Hosting): `pnpm generate` -> `.output/public`
- Add shadcn component: `pnpm dlx shadcn-vue@latest add <name>`
- Unit tests: `pnpm test` (Vitest; `shared/**`, `app/**`, `functions/src/**` 의 `*.test.ts`)
- Functions build: `pnpm functions:build` (esbuild로 `functions/src` + `shared/` 번들 → `functions/lib`)
- Emulators: `pnpm emulators` (firebase-tools는 devDependency. Firestore 에뮬레이터에는 Java 21+ 필요)

## Repo layout
- `app/` Nuxt 앱, `shared/` 앱·서버 공용 순수 코드(Nuxt에서는 `#shared`로 import), `functions/` Cloud Functions (pnpm 워크스페이스 패키지)
- `pnpm-workspace.yaml`의 `allowBuilds`는 설치 스크립트 허용 목록(보안 설정). 새 패키지가 빌드 스크립트를 요구하면 임의로 true로 바꾸지 말고 사용자에게 묻는다. 현재 `re2`, `esbuild`는 false(없어도 동작).

## Environment notes
- Corporate network does SSL inspection. Run pnpm/npx with `NODE_OPTIONS=--use-system-ca` (uses the Windows cert store). For curl, use `--ssl-no-revoke`.
- `typescript` is pinned to `^6`. TS 7 (native) has no JS API, which breaks Vue tooling and the shadcn-vue CLI.
- shadcn-vue CLI detects Nuxt only for v3/v4 (by coercing the `nuxt` version in package.json). With Nuxt 5 detection fails, so it falls back to the root `tsconfig.json`; `compilerOptions.paths` (`@/*`) there exists to make `add` work. Don't remove it.
- `shadcn-vue init` was run by temporarily changing the nuxt spec to `npm:nuxt-nightly@latest`; re-running `init` requires the same trick.

## Firebase
- Project: `memorize-c6c1b` (현재 dev 겸용). Blaze 요금제 전환 예정. 리전은 `asia-northeast3`(서울).
- Config is read from `NUXT_PUBLIC_FIREBASE_*` env vars (see `.env.example`), initialized in `app/plugins/firebase.client.ts`.
- Use `useNuxtApp().$firestore` / `$storage`.
