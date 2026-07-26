import { t } from './i18n.js';

export function createPagination({ previous, next, label, onChange, initialPerPage = 50 } = {}) {
  const state = { page: 1, perPage: initialPerPage, hasMore: false };
  function render() {
    if (previous) previous.disabled = state.page <= 1;
    if (next) next.disabled = !state.hasMore;
    if (label) label.textContent = t('Page {page}', { page: state.page });
  }
  previous?.addEventListener('click', () => { if (state.page > 1) { state.page -= 1; render(); onChange?.(state); } });
  next?.addEventListener('click', () => { if (state.hasMore) { state.page += 1; render(); onChange?.(state); } });
  return { state, setPage(page) { state.page = page; render(); }, setHasMore(hasMore) { state.hasMore = Boolean(hasMore); render(); }, reset() { state.page = 1; render(); }, render };
}
