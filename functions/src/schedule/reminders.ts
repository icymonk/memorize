import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { dateKey } from '../../../shared/dates'
import { currentSlot } from '../../../shared/reminders'
import { sendPush } from '../lib/push'

/** ACC-21·NOTE-38: 지금 15분 칸에 리마인더를 정한 사람에게 푸시. 복습은 오늘 볼 카드가 있을 때, 일지는 오늘 안 썼을 때만 */
export async function sendReminders(now = new Date()) {
  const db = getFirestore()
  const slot = currentSlot(now)
  const [review, journal] = await Promise.all([
    db.collection('users').where('reminders.reviewUtc', '==', slot).get(),
    db.collection('users').where('reminders.journalUtc', '==', slot).get(),
  ])
  let sent = 0
  for (const u of review.docs) {
    const due = await db.collectionGroup('cardStates').where('uid', '==', u.id).where('due', '<=', now.getTime()).limit(1).get()
    if (!due.empty) sent += await sendPush(u.id, { title: '복습할 시간이에요', body: '오늘 복습할 카드가 기다리고 있어요.', link: '/review' })
  }
  for (const u of journal.docs) {
    const today = dateKey(now, String(u.get('reminders.tz') || 'Asia/Seoul'))
    const written = await db.collectionGroup('pages').where('ownerId', '==', u.id).where('type', '==', 'journal').where('props.date', '==', today).limit(1).get()
    if (written.empty) sent += await sendPush(u.id, { title: '오늘 학습일지', body: '오늘 일지를 아직 안 썼어요. 한 줄만 남겨 볼까요?', link: '/journal' })
  }
  return sent
}

export const cronReminders = onSchedule({ schedule: 'every 15 minutes', timeZone: 'UTC' }, async () => {
  logger.info('reminders sent', { sent: await sendReminders() })
})
