import { initializeApp } from 'firebase-admin/app'
import { setGlobalOptions } from 'firebase-functions/v2'
import { REGION } from '../../shared/limits'

// ESM은 import를 먼저 평가하므로, 함수 정의(onCall 등)보다 먼저 import되는 이 모듈에서 전역 설정을 한다.
initializeApp()
setGlobalOptions({ region: REGION })
