import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'

export async function createEnv(): Promise<RulesTestEnvironment> {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8180').split(':')
  return initializeTestEnvironment({
    projectId: 'demo-memorize-spike',
    firestore: {
      host,
      port: Number(port),
      rules: readFileSync(resolve(import.meta.dirname, '../firestore.rules'), 'utf8'),
    },
  })
}
