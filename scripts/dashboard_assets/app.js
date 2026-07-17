'use strict';

const PAGE_SIZE = 10;
const state = { queries: [], filtered: [], visibleCount: PAGE_SIZE, modifiedAt: null };
const elements = {};

function byId(id) { return document.getElementById(id); }
function percent(value) { return value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`; }
function dateOnly(value) { return typeof value === 'string' ? value.slice(0, 10) : ''; }
function formatDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unknown date' : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function resultMode(context) {
  if (context && (context.route === 'dev' || context.indexId)) return 'dev';
  if (context && context.route === 'default') return 'normal';
  return 'normal_inferred';
}
function modeLabel(mode) { return mode === 'dev' ? 'Dev' : mode === 'normal' ? 'Normal' : 'Normal / legacy'; }
function ratingLabel(rating) { return rating === 'like' ? 'Like' : rating === 'dislike' ? 'Dislike' : 'Unrated'; }

function normalizeQuery(query) {
  const urls = Array.isArray(query.freesound_urls) ? query.freesound_urls : [];
  const ratings = Array.isArray(query.ratings) ? query.ratings : [];
  const contexts = Array.isArray(query.result_contexts) ? query.result_contexts : [];
  const count = Math.max(urls.length, ratings.length, contexts.length);
  const results = Array.from({ length: count }, (_, index) => {
    const context = contexts[index] && typeof contexts[index] === 'object' ? contexts[index] : null;
    const rating = ratings[index] === 'like' || ratings[index] === 'dislike' ? ratings[index] : null;
    return {
      position: index + 1,
      rank: Number.isInteger(context?.rank) && context.rank > 0 ? context.rank : index + 1,
      route: typeof context?.route === 'string' ? context.route : 'unknown',
      indexId: typeof context?.indexId === 'string' ? context.indexId : '',
      indexLabel: typeof context?.indexLabel === 'string' ? context.indexLabel : '',
      url: typeof urls[index] === 'string' ? urls[index] : '',
      rating,
      mode: resultMode(context),
    };
  });
  return {
    audioId: String(query.audioId || ''),
    audioUrl: typeof query.audioUrl === 'string' ? query.audioUrl : '',
    createdAt: typeof query.createdAt === 'string' ? query.createdAt : '',
    isUpdate: Boolean(query.isUpdate),
    versionCount: Number(query.versionCount || 1),
    mode: results.some(result => result.mode === 'dev') ? 'dev' : (results.some(result => result.mode === 'normal') ? 'normal' : 'normal_inferred'),
    results,
  };
}

function collectElements() {
  ['start-date', 'end-date', 'mode-filter', 'index-filter', 'rating-filter', 'sort-filter',
    'summary-cards', 'index-chart', 'rank-chart', 'timeline-chart', 'query-list',
    'filter-summary', 'data-updated', 'load-more-button', 'error-panel'].forEach(id => { elements[id] = byId(id); });
}

function populateIndexFilter() {
  const select = elements['index-filter'];
  const selected = select.value;
  const indexes = new Map();
  state.queries.flatMap(query => query.results).forEach(result => {
    if (result.indexId) indexes.set(result.indexId, result.indexLabel || result.indexId);
  });
  select.replaceChildren(new Option('All indices', 'all'));
  [...indexes.entries()].sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, label]) => select.add(new Option(label, id)));
  select.value = [...select.options].some(option => option.value === selected) ? selected : 'all';
}

function ratingMatches(rating, filter) {
  if (filter === 'all') return true;
  if (filter === 'rated') return rating === 'like' || rating === 'dislike';
  if (filter === 'unrated') return !rating;
  return rating === filter;
}

function applyFilters() {
  const start = elements['start-date'].value;
  const end = elements['end-date'].value;
  const mode = elements['mode-filter'].value;
  const index = elements['index-filter'].value;
  const rating = elements['rating-filter'].value;
  const sort = elements['sort-filter'].value;

  state.filtered = state.queries.map(query => {
    const day = dateOnly(query.createdAt);
    if ((start && day < start) || (end && day > end)) return null;
    const results = query.results.filter(result => {
      if (mode === 'normal' && result.mode === 'dev') return false;
      if (mode === 'dev' && result.mode !== 'dev') return false;
      if (index !== 'all' && result.indexId !== index) return false;
      return ratingMatches(result.rating, rating);
    });
    return results.length ? { ...query, filteredResults: results } : null;
  }).filter(Boolean).sort((a, b) => {
    const order = a.createdAt.localeCompare(b.createdAt);
    return sort === 'oldest' ? order : -order;
  });
  state.visibleCount = PAGE_SIZE;
  render();
}

function metrics(queries) {
  const results = queries.flatMap(query => query.filteredResults);
  const likes = results.filter(result => result.rating === 'like').length;
  const dislikes = results.filter(result => result.rating === 'dislike').length;
  const rated = likes + dislikes;
  const topRankRated = results.filter(result => result.rank === 1 && result.rating);
  return {
    queries: queries.length,
    results: results.length,
    rated,
    likes,
    dislikes,
    coverage: results.length ? rated / results.length : null,
    likeRate: rated ? likes / rated : null,
    topOneLikeRate: topRankRated.length ? topRankRated.filter(result => result.rating === 'like').length / topRankRated.length : null,
  };
}

function createSummaryCard(label, value, context) {
  const card = document.createElement('div'); card.className = 'summary-card';
  const labelNode = document.createElement('p'); labelNode.className = 'summary-label'; labelNode.textContent = label;
  const valueNode = document.createElement('p'); valueNode.className = 'summary-value'; valueNode.textContent = value;
  const contextNode = document.createElement('p'); contextNode.className = 'summary-context'; contextNode.textContent = context;
  card.append(labelNode, valueNode, contextNode); return card;
}

function renderSummary() {
  const value = metrics(state.filtered);
  elements['summary-cards'].replaceChildren(
    createSummaryCard('Queries', String(value.queries), `${value.results} matching results`),
    createSummaryCard('Rated', String(value.rated), `${percent(value.coverage)} coverage`),
    createSummaryCard('Likes', String(value.likes), `${value.dislikes} dislikes`),
    createSummaryCard('Like rate', percent(value.likeRate), 'among rated results'),
    createSummaryCard('Top-rank like rate', percent(value.topOneLikeRate), 'among rated rank-1 results'),
    createSummaryCard('Unrated', String(value.results - value.rated), 'results without a vote'),
  );
}

function groupedResults(keyFunction) {
  const groups = new Map();
  state.filtered.flatMap(query => query.filteredResults).forEach(result => {
    const key = keyFunction(result);
    if (!groups.has(key)) groups.set(key, { likes: 0, dislikes: 0, unrated: 0 });
    const group = groups.get(key);
    if (result.rating === 'like') group.likes += 1;
    else if (result.rating === 'dislike') group.dislikes += 1;
    else group.unrated += 1;
  });
  return groups;
}

function renderBarChart(container, groups, mode) {
  container.replaceChildren();
  if (!groups.size) { const empty = document.createElement('p'); empty.className = 'chart-empty'; empty.textContent = 'No results match these filters.'; container.append(empty); return; }
  [...groups.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true })).forEach(([label, values]) => {
    const rated = values.likes + values.dislikes;
    const total = rated + values.unrated;
    const row = document.createElement('div'); row.className = 'chart-row';
    const name = document.createElement('div'); name.className = 'chart-label'; name.textContent = label;
    const track = document.createElement('div'); track.className = 'bar-track';
    track.setAttribute('aria-label', `${label}: ${values.likes} likes, ${values.dislikes} dislikes, ${values.unrated} unrated`);
    const like = document.createElement('div'); like.className = 'bar-like';
    const dislike = document.createElement('div'); dislike.className = 'bar-dislike';
    if (mode === 'rate') {
      like.style.width = rated ? `${values.likes / rated * 100}%` : '0';
      dislike.style.width = rated ? `${values.dislikes / rated * 100}%` : '0';
    } else {
      like.style.width = total ? `${values.likes / total * 100}%` : '0';
      dislike.style.width = total ? `${values.dislikes / total * 100}%` : '0';
    }
    track.append(like, dislike);
    const display = document.createElement('div'); display.className = 'bar-value';
    display.textContent = rated ? `${values.likes} like · ${values.dislikes} dislike` : `${total} unrated`;
    row.append(name, track, display); container.append(row);
  });
}

function renderCharts() {
  const byIndex = groupedResults(result => result.indexId ? (result.indexLabel || result.indexId) : 'Normal / legacy');
  const byRank = groupedResults(result => `Rank ${result.rank}`);
  renderBarChart(elements['index-chart'], byIndex, 'count');
  renderBarChart(elements['rank-chart'], byRank, 'rate');

  const byDay = new Map();
  state.filtered.forEach(query => { const day = dateOnly(query.createdAt) || 'Unknown'; byDay.set(day, (byDay.get(day) || 0) + 1); });
  const timeline = elements['timeline-chart']; timeline.replaceChildren();
  if (!byDay.size) { const empty = document.createElement('p'); empty.className = 'chart-empty'; empty.textContent = 'No dated queries match these filters.'; timeline.append(empty); return; }
  const maximum = Math.max(...byDay.values());
  [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([day, count]) => {
    const column = document.createElement('div'); column.className = 'day-column';
    const bar = document.createElement('div'); bar.className = 'day-bar'; bar.style.height = `${Math.max(4, count / maximum * 135)}px`; bar.setAttribute('aria-label', `${day}: ${count} queries`);
    const countNode = document.createElement('div'); countNode.className = 'day-count'; countNode.textContent = String(count);
    const label = document.createElement('div'); label.className = 'day-label'; label.textContent = day.slice(5);
    column.append(bar, countNode, label); timeline.append(column);
  });
}

function extractSoundId(url) { const match = String(url).match(/\/(?:sounds|s)\/(\d+)\/?/); return match ? match[1] : null; }
function createResultRow(result) {
  const row = document.createElement('div'); row.className = 'result-row';
  const rank = document.createElement('span'); rank.className = 'rank-label'; rank.textContent = `#${result.rank}`;
  const index = document.createElement('span'); index.className = 'index-label'; index.textContent = result.indexLabel || result.indexId || 'Normal / legacy';
  const rating = document.createElement('span'); rating.className = `rating-badge ${result.rating || 'unrated'}`; rating.textContent = ratingLabel(result.rating);
  const actions = document.createElement('div'); actions.className = 'result-actions';
  if (result.url) {
    const link = document.createElement('a'); link.href = result.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Freesound ↗'; actions.append(link);
    const soundId = extractSoundId(result.url);
    if (soundId) {
      const player = document.createElement('button'); player.type = 'button'; player.className = 'player-button'; player.textContent = 'Load player';
      player.addEventListener('click', () => {
        const wrap = document.createElement('div'); wrap.className = 'player-wrap';
        const iframe = document.createElement('iframe'); iframe.loading = 'lazy'; iframe.title = `Freesound result ${soundId}`;
        iframe.src = `https://freesound.org/embed/sound/iframe/${soundId}/simple/small/`;
        iframe.sandbox = 'allow-scripts allow-same-origin allow-presentation'; wrap.append(iframe); row.append(wrap); player.remove();
      }, { once: true });
      actions.append(player);
    }
  }
  row.append(rank, index, rating, actions); return row;
}

function createQueryCard(query) {
  const details = document.createElement('details'); details.className = 'query-card';
  const summary = document.createElement('summary');
  const main = document.createElement('div'); main.className = 'query-summary-main';
  const date = document.createElement('span'); date.className = 'query-date'; date.textContent = formatDate(query.createdAt);
  const mode = document.createElement('span'); mode.className = 'tag'; mode.textContent = modeLabel(query.mode);
  const rated = query.filteredResults.filter(result => result.rating).length;
  const meta = document.createElement('span'); meta.className = 'query-meta'; meta.textContent = `${rated}/${query.filteredResults.length} shown results rated${query.versionCount > 1 ? ` · ${query.versionCount} versions` : ''}`;
  main.append(date, mode, meta); summary.append(main);

  const body = document.createElement('div'); body.className = 'query-body';
  const audioPanel = document.createElement('div'); audioPanel.className = 'audio-panel';
  const audioTitle = document.createElement('h3'); audioTitle.textContent = 'Imitation recording'; audioPanel.append(audioTitle);
  if (/^https?:\/\//.test(query.audioUrl)) {
    const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none'; audio.src = query.audioUrl; audioPanel.append(audio);
  } else {
    const unavailable = document.createElement('p'); unavailable.className = 'audio-unavailable'; unavailable.textContent = 'Recording URL unavailable.'; audioPanel.append(unavailable);
  }
  const id = document.createElement('div'); id.className = 'query-id'; id.textContent = query.audioId; audioPanel.append(id);
  const results = document.createElement('div'); results.className = 'results-list';
  const resultsTitle = document.createElement('h3'); resultsTitle.textContent = 'Returned sounds'; results.append(resultsTitle);
  query.filteredResults.forEach(result => results.append(createResultRow(result)));
  body.append(audioPanel, results); details.append(summary, body); return details;
}

function renderQueries() {
  const list = elements['query-list']; list.replaceChildren();
  state.filtered.slice(0, state.visibleCount).forEach(query => list.append(createQueryCard(query)));
  if (!state.filtered.length) { const empty = document.createElement('p'); empty.className = 'chart-empty'; empty.textContent = 'No queries match these filters.'; list.append(empty); }
  const wrap = elements['load-more-button'].parentElement;
  wrap.hidden = state.visibleCount >= state.filtered.length;
}

function render() {
  renderSummary(); renderCharts(); renderQueries();
  const matchingResults = state.filtered.reduce((sum, query) => sum + query.filteredResults.length, 0);
  elements['filter-summary'].textContent = `Showing ${state.filtered.length} of ${state.queries.length} queries and ${matchingResults} matching results.`;
}

function csvCell(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
function exportCsv() {
  const header = ['audioId', 'createdAt', 'mode', 'indexId', 'indexLabel', 'rank', 'rating', 'freesoundUrl', 'audioUrl'];
  const rows = state.filtered.flatMap(query => query.filteredResults.map(result => [query.audioId, query.createdAt, result.mode, result.indexId, result.indexLabel, result.rank, result.rating || '', result.url, query.audioUrl]));
  const blob = new Blob([[header, ...rows].map(row => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `thatsoundslikeme-feedback-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
}

async function loadData() {
  elements['error-panel'].hidden = true;
  try {
    const response = await fetch('/api/data', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    state.queries = data.queries.map(normalizeQuery);
    state.modifiedAt = data.modifiedAt;
    populateIndexFilter();
    elements['data-updated'].textContent = `Data refreshed ${formatDate(data.modifiedAt)}`;
    applyFilters();
  } catch (error) {
    elements['error-panel'].textContent = `Could not load feedback data: ${error.message}`;
    elements['error-panel'].hidden = false;
  }
}

function resetFilters() {
  elements['start-date'].value = ''; elements['end-date'].value = '';
  elements['mode-filter'].value = 'all'; elements['index-filter'].value = 'all';
  elements['rating-filter'].value = 'all'; elements['sort-filter'].value = 'newest'; applyFilters();
}

document.addEventListener('DOMContentLoaded', () => {
  collectElements();
  ['start-date', 'end-date', 'mode-filter', 'index-filter', 'rating-filter', 'sort-filter'].forEach(id => elements[id].addEventListener('change', applyFilters));
  byId('reset-button').addEventListener('click', resetFilters);
  byId('reload-button').addEventListener('click', loadData);
  byId('export-button').addEventListener('click', exportCsv);
  elements['load-more-button'].addEventListener('click', () => { state.visibleCount += PAGE_SIZE; renderQueries(); });
  loadData();
});
