// Плейлисты и разбор ответа DJ. Сами файлы музыки живут в IndexedDB, не здесь.

function parseIdList(text, knownIds) {
  const known = {};
  (knownIds || []).forEach((id) => { known[String(id)] = 1; });
  const raw = String(text || '');
  const m = raw.match(/\[[\s\S]*?\]/);
  let arr = [];
  if (m) {
    try { arr = JSON.parse(m[0]); } catch (e) { arr = []; }
  }
  if (!Array.isArray(arr)) arr = raw.split(/[\s,]+/);
  const out = [];
  arr.forEach((item) => {
    const id = String(item || '').replace(/^["']|["']$/g, '').trim();
    if (known[id] && out.indexOf(id) === -1) out.push(id);
  });
  return out;
}

function djPrompt(tracks, recent) {
  const catalog = tracks.map((t) => t.id + ' | ' + (t.artist ? t.artist + ' — ' : '') + t.name).join('\n');
  return [
    'Собери плейлист только из библиотеки ниже. Не выдумывай треки.',
    'Ответ — JSON-массив id, от 4 до 12 штук, без пояснений.',
    'Сцена:',
    recent || '(нет реплик)',
    'Библиотека:',
    catalog || '(пусто)',
  ].join('\n');
}

function sleepLabel(ms) {
  if (!ms) return 'выкл';
  const m = Math.round(ms / 60000);
  return m + ' мин';
}

const LocalMusicEngine = { parseIdList, djPrompt, sleepLabel };
globalThis.LocalMusicEngine = LocalMusicEngine;
export { LocalMusicEngine };
