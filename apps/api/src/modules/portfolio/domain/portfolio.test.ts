import { PORTFOLIO_MAX_ITEMS } from '@rt/contracts';
import { describe, expect, it } from 'vitest';
import { Portfolio, PortfolioEvents, type CandidateMedia } from './portfolio.js';

const TALENT = '0192a3b4-0000-7000-8000-00000000a001';
const now = new Date('2026-10-01T09:00:00.000Z');
const later = new Date('2026-10-01T09:05:00.000Z');

const media = (overrides: Partial<CandidateMedia> = {}): CandidateMedia => ({
  ownerId: TALENT,
  purpose: 'portfolio',
  kind: 'image',
  status: 'ready',
  ...overrides,
});

function withItems(count: number): Portfolio {
  const portfolio = Portfolio.empty(TALENT, now);
  for (let index = 0; index < count; index += 1) {
    const added = portfolio.addItem({
      id: `item-${String(index)}`,
      mediaId: `media-${String(index)}`,
      media: media(),
      caption: '',
      now,
    });
    if (!added.ok) throw new Error(added.error.message);
  }
  portfolio.pullEvents();
  return portfolio;
}

describe('Portfolio', () => {
  it('adds an item at the end, bumps the version and raises ItemAdded', () => {
    const portfolio = withItems(1);
    const added = portfolio.addItem({
      id: 'item-new',
      mediaId: 'media-new',
      media: media({ status: 'scanning' }),
      caption: 'Lagos Fashion Week, closing look',
      now: later,
    });
    expect(added.ok).toBe(true);
    expect(portfolio.items.map((item) => item.id)).toEqual(['item-0', 'item-new']);
    expect(portfolio.version).toBe(2);
    expect(portfolio.pullEvents().map((event) => event.type)).toEqual([PortfolioEvents.ItemAdded]);
  });

  it.each([
    ['someone else owns the file', media({ ownerId: 'another-user' }), 'NOT_FOUND'],
    ['the file is an avatar', media({ purpose: 'avatar' }), 'MEDIA_WRONG_PURPOSE'],
    ['the upload has not finished', media({ status: 'awaiting_upload' }), 'MEDIA_NOT_UPLOADED'],
    ['the scan rejected it', media({ status: 'rejected' }), 'MEDIA_WRONG_STATE'],
    ['processing failed', media({ status: 'failed' }), 'MEDIA_WRONG_STATE'],
    ['it was deleted', media({ status: 'deleted' }), 'MEDIA_WRONG_STATE'],
  ])('refuses a file when %s', (_, candidate, code) => {
    const portfolio = Portfolio.empty(TALENT, now);
    const added = portfolio.addItem({ id: 'i', mediaId: 'm', media: candidate, caption: '', now });
    expect(added.ok ? null : added.error.code).toBe(code);
    expect(portfolio.version).toBe(0);
  });

  it('refuses a missing file as not found', () => {
    const added = Portfolio.empty(TALENT, now).addItem({
      id: 'i',
      mediaId: 'm',
      media: null,
      caption: '',
      now,
    });
    expect(added.ok ? null : added.error.code).toBe('NOT_FOUND');
  });

  it('refuses the same file twice', () => {
    const portfolio = withItems(1);
    const again = portfolio.addItem({
      id: 'i',
      mediaId: 'media-0',
      media: media(),
      caption: '',
      now,
    });
    expect(again.ok ? null : again.error.code).toBe('MEDIA_ALREADY_USED');
  });

  it(`stops at ${String(PORTFOLIO_MAX_ITEMS)} items`, () => {
    const portfolio = withItems(PORTFOLIO_MAX_ITEMS);
    const extra = portfolio.addItem({
      id: 'i',
      mediaId: 'one-too-many',
      media: media(),
      caption: '',
      now,
    });
    expect(extra.ok ? null : extra.error.code).toBe('PORTFOLIO_FULL');
  });

  it('changes a caption and leaves the version alone when nothing changed', () => {
    const portfolio = withItems(1);
    expect(portfolio.updateCaption('item-0', 'Eko Atlantic shoot', later).ok).toBe(true);
    expect(portfolio.items[0]?.caption).toBe('Eko Atlantic shoot');
    expect(portfolio.version).toBe(2);
    portfolio.updateCaption('item-0', 'Eko Atlantic shoot', later);
    expect(portfolio.version).toBe(2);
    expect(portfolio.updateCaption('missing', 'x', later).ok).toBe(false);
  });

  it('removes an item and returns it so its media can be released', () => {
    const portfolio = withItems(2);
    const removed = portfolio.removeItem('item-0', later);
    expect(removed.ok && removed.value.mediaId).toBe('media-0');
    expect(portfolio.items.map((item) => item.id)).toEqual(['item-1']);
    expect(portfolio.pullEvents()[0]?.type).toBe(PortfolioEvents.ItemRemoved);
  });

  it('reorders when every item is named once', () => {
    const portfolio = withItems(3);
    expect(portfolio.reorder(['item-2', 'item-0', 'item-1'], later).ok).toBe(true);
    expect(portfolio.items.map((item) => item.id)).toEqual(['item-2', 'item-0', 'item-1']);
    expect(portfolio.version).toBe(4);
  });

  it.each([
    ['an item is left out', ['item-0', 'item-1']],
    ['an unknown id is sent', ['item-0', 'item-1', 'item-9']],
    ['an id repeats', ['item-0', 'item-0', 'item-1']],
  ])('refuses a reorder when %s', (_, ids) => {
    const portfolio = withItems(3);
    const result = portfolio.reorder(ids, later);
    expect(result.ok ? null : result.error.code).toBe('PORTFOLIO_ORDER_MISMATCH');
    expect(portfolio.version).toBe(3);
  });

  it('does not bump the version for a reorder that keeps the same order', () => {
    const portfolio = withItems(2);
    portfolio.reorder(['item-0', 'item-1'], later);
    expect(portfolio.version).toBe(2);
  });
});
