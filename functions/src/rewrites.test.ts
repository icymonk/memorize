import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REGION } from '../../shared/limits'

const root = resolve(import.meta.dirname, '../..')
const exported = [...readFileSync(resolve(root, 'functions/src/index.ts'), 'utf8').matchAll(/export \{([^}]*)\} from '\.\/callable\//g)]
  .flatMap(m => m[1]!.split(',').map(s => s.trim()).filter(Boolean))
const rewrites: { source: string, function?: { functionId: string, region: string } }[]
  = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8')).hosting.rewrites

describe('hosting rewrites for callables (docs/dev/functions.md 1절)', () => {
  it('every exported function has /fn/{name} → function in REGION', () => {
    for (const name of exported) {
      expect(rewrites, name).toContainEqual({ source: `/fn/${name}`, function: { functionId: name, region: REGION } })
    }
  })
  it('function rewrites come before the SPA catch-all', () => {
    const catchAll = rewrites.findIndex(r => r.source === '**')
    const lastFn = rewrites.findLastIndex(r => r.source.startsWith('/fn/'))
    expect(lastFn).toBeLessThan(catchAll)
  })
})
