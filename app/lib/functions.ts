import type { Callables } from '#shared/schemas/account'
import type { Functions } from 'firebase/functions'
import { httpsCallable } from 'firebase/functions'

export async function callFn<K extends keyof Callables>(
  functions: Functions,
  name: K,
  input: Callables[K]['input'],
): Promise<Callables[K]['output']> {
  const fn = httpsCallable<Callables[K]['input'], Callables[K]['output']>(functions, name)
  return (await fn(input)).data
}
