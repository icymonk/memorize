import type { Functions } from 'firebase/functions'
import type { Firestore } from 'firebase/firestore'
import type { FeedbackScore, Stamp } from '#shared/schemas/feedback'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { callFn } from '~/lib/functions'

/** CMN-23: 작성자가 피드백을 부탁할 멤버를 정한다. 그 멤버는 글을 볼 수 있게 된다(NOTE-53) */
export function setReviewers(db: Firestore, sid: string, pageId: string, reviewerIds: string[]) {
  return updateDoc(doc(db, 'spaces', sid, 'pages', pageId), { reviewerIds, updatedAt: serverTimestamp() })
}

/** REV-14 */
export function requestRewrite(fns: Functions, spaceId: string, pageId: string, reason: string) {
  return callFn(fns, 'requestRewrite', { spaceId, pageId, reason })
}

/** CMN-24 */
export function leaveFeedback(fns: Functions, spaceId: string, pageId: string, stamp: Stamp, body: string, score: FeedbackScore | null = null) {
  return callFn(fns, 'leaveFeedback', { spaceId, pageId, stamp, body, score })
}
