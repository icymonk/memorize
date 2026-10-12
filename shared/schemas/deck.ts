import { z } from 'zod'

/** VOC-01·02·03 — docs/dev/data-model.md 5절 */
export const DECK_VISIBILITY = ['private', 'group', 'space'] as const
export type DeckVisibility = (typeof DECK_VISIBILITY)[number]
export const EDIT_POLICY = ['author', 'collaborators', 'everyone'] as const
export type EditPolicy = (typeof EDIT_POLICY)[number]

/** VOC-10 카드 항목 (앞면·뒷면은 항상 포함) */
export const CARD_FIELDS = ['pos', 'phonetic', 'audio', 'examples', 'forms', 'synonyms', 'antonyms', 'collocations', 'image', 'tip', 'tags', 'difficulty'] as const
export type CardField = (typeof CARD_FIELDS)[number]
export const DEFAULT_CARD_FIELDS: CardField[] = ['pos', 'phonetic', 'examples', 'tip']

export const LANGS = ['en', 'ko', 'ja', 'zh', 'es', 'fr', 'de', 'vi', 'other'] as const
export type Lang = (typeof LANGS)[number]

export const deckInput = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  langFrom: z.enum(LANGS).default('en'),
  langTo: z.enum(LANGS).default('ko'),
  tags: z.array(z.string().trim().min(1).max(20)).max(10).default([]),
  folderId: z.string().min(1).max(128).nullable().default(null),
  fields: z.array(z.enum(CARD_FIELDS)).default(DEFAULT_CARD_FIELDS),
  visibility: z.enum(DECK_VISIBILITY).default('space'),
  groupIds: z.array(z.string().min(1).max(128)).max(20).default([]),
  editPolicy: z.enum(EDIT_POLICY).default('author'),
  collaboratorIds: z.array(z.string().min(1).max(128)).max(50).default([]),
})
export type DeckInput = z.infer<typeof deckInput>

export const deckFolderInput = z.object({ name: z.string().trim().min(1).max(40) })
export type DeckFolderInput = z.infer<typeof deckFolderInput>
