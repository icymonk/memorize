import { build } from 'esbuild'

// shared/ 코드는 번들에 포함하고, Firebase SDK는 배포 환경에서 설치된 것을 쓴다.
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: ['firebase-functions', 'firebase-functions/*', 'firebase-admin', 'firebase-admin/*'],
})
