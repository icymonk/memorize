import { z } from 'zod'

/** VOC-10 카드 — docs/dev/data-model.md 5절 */
export const DIFFICULTY = ['easy', 'normal', 'hard'] as const
export type Difficulty = (typeof DIFFICULTY)[number]

const text = (max: number) => z.string().trim().max(max)
const linked = z.object({ text: text(100).min(1), cardId: z.string().max(128).optional() })

export const cardInput = z.object({
  front: text(200).min(1),
  back: z.array(text(300).min(1)).min(1).max(10),
  pos: text(30).optional(),
  phonetic: text(100).optional(),
  audio: z.object({ fileId: z.string().max(128).optional(), tts: z.boolean() }).optional(),
  examples: z.array(z.object({ text: text(500).min(1), translation: text(500).optional() })).max(10).default([]),
  forms: text(200).optional(),
  synonyms: z.array(linked).max(20).default([]),
  antonyms: z.array(linked).max(20).default([]),
  collocations: z.array(text(100).min(1)).max(20).default([]),
  imageFileId: z.string().max(128).optional(),
  tip: text(500).optional(),
  tags: z.array(text(20).min(1)).max(10).default([]),
  difficulty: z.enum(DIFFICULTY).optional(),
})
export type CardInput = z.infer<typeof cardInput>

export const MAX_CARDS_PER_DECK = 2000
