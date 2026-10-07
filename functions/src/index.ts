import { initializeApp } from 'firebase-admin/app'
import { setGlobalOptions } from 'firebase-functions/v2'
import { REGION } from '../../shared/limits'

initializeApp()
setGlobalOptions({ region: REGION })

export { completeOnboarding, ensureAccount } from './callable/account'
