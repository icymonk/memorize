import { describe, expect, it } from 'vitest'
import { linkRelated } from './card-links'

describe('linkRelated (VOC-10)', () => {
  const cards = [{ id: 'a', front: 'Big' }, { id: 'b', front: 'large' }, { id: 'self', front: 'huge' }]
  it('links words that match another card front in the deck', () => {
    expect(linkRelated([{ text: 'big' }, { text: 'giant' }], cards)).toEqual([{ text: 'big', cardId: 'a' }, { text: 'giant' }])
  })
  it('never links a card to itself and drops stale links', () => {
    expect(linkRelated([{ text: 'huge' }, { text: 'tiny', cardId: 'gone' }], cards, 'self')).toEqual([{ text: 'huge' }, { text: 'tiny' }])
  })
})
