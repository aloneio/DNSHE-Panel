import { describe, expect, it } from 'vitest';
// @ts-expect-error browser ES module intentionally has no TypeScript declaration
import { t } from '../public/js/i18n.js';

describe('Chinese UI text', () => {
  it('uses Chinese by default and interpolates translated messages', () => {
    expect(t('Load inventory')).toBe('加载清单');
    expect(t('Loaded {count} domain(s).', { count: 7 })).toBe('已加载 7 个域名。');
    expect(t('Domain details · {domain}', { domain: 'example.com' })).toBe('域名详情 · example.com');
  });
});
