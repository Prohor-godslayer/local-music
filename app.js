function bootMusic(host) {
  const shell = globalThis.LocalShell;
  const eng = globalThis.LocalMusicEngine;
  const ui = shell.mount({
    id: 'music', glyph: '♪', label: 'Локальная музыка', accent: '#e0b15a', bottom: 276, right: 16,
  });

  const dbName = 'local-music';
  let meta = { playlists: [], queue: [], idx: 0, fade: 2, volume: 0.9 };
  let tracks = [];
  let view = 'play';
  const Root = shell.win();
  if (Root.__lxMusicAudio) Root.__lxMusicAudio.forEach((a) => { try { a.pause(); } catch (e) {} });
  if (Root.__lxMusicSleep) clearTimeout(Root.__lxMusicSleep);
  const audio = [new Root.Audio(), new Root.Audio()];
  Root.__lxMusicAudio = audio;
  let slot = 0;
  let playGen = 0;
  let urls = {};

  function idb() {
    const factory = (Root.indexedDB || indexedDB);
    return new Promise((resolve, reject) => {
      const req = factory.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function readAll() {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readonly');
      const rq = tx.objectStore('tracks').getAll();
      rq.onsuccess = () => resolve(rq.result || []);
      rq.onerror = () => reject(rq.error);
    });
  }

  async function writeTrack(row) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function deleteTrack(id) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite');
      tx.objectStore('tracks').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function trackById(id) { return tracks.find((t) => t.id === id) || null; }
  function current() { return trackById(meta.queue[meta.idx]); }

  async function load() {
    const saved = await host.load('meta');
    if (saved && typeof saved === 'object') meta = Object.assign(meta, saved);
    meta.playlists = Array.isArray(meta.playlists) ? meta.playlists : [];
    meta.queue = Array.isArray(meta.queue) ? meta.queue : [];
    try { tracks = await readAll(); }
    catch (e) { tracks = []; ui.toast('Хранилище браузера недоступно, файлы живут до закрытия вкладки'); }
    audio.forEach((a) => { a.volume = Number(meta.volume) || 0.9; });
  }

  async function saveMeta() { await host.save('meta', meta); }

  function urlFor(track) {
    if (!track) return '';
    if (!urls[track.id]) urls[track.id] = URL.createObjectURL(track.blob);
    return urls[track.id];
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function playIndex(i) {
    if (!meta.queue.length) { ui.toast('Очередь пуста'); return; }
    const gen = ++playGen;
    meta.idx = (i + meta.queue.length) % meta.queue.length;
    let guard = 0;
    while (guard < meta.queue.length && (!current() || !current().blob)) {
      meta.idx = (meta.idx + 1) % meta.queue.length;
      guard++;
    }
    const track = current();
    if (!track || !track.blob) { ui.toast('Файлы очереди не найдены на устройстве'); return; }
    const next = audio[slot ^ 1];
    const prev = audio[slot];
    next.src = urlFor(track);
    const fade = Math.max(0, Number(meta.fade) || 0);
    const vol = Number(meta.volume) || 0.9;
    try {
      next.volume = fade ? 0 : vol;
      await next.play();
    } catch (e) {
      ui.toast('Браузер не дал включить звук. Нажми ещё раз.');
      return;
    }
    if (gen !== playGen) { try { next.pause(); } catch (err) {} return; }
    if (fade && !prev.paused) {
      const steps = 10;
      for (let s = 1; s <= steps; s++) {
        await wait((fade * 1000) / steps);
        if (gen !== playGen) return;
        next.volume = Math.min(vol, (vol * s) / steps);
        prev.volume = Math.max(0, vol * (1 - s / steps));
      }
      prev.pause();
    } else {
      prev.pause();
      next.volume = vol;
    }
    if (gen !== playGen) return;
    slot ^= 1;
    await saveMeta();
    render();
  }

  function pause() {
    audio.forEach((a) => a.pause());
    render();
  }

  function playing() { return audio.some((a) => !a.paused && a.currentTime > 0); }

  audio.forEach((a) => {
    a.addEventListener('ended', () => {
      if (meta.idx < meta.queue.length - 1) playIndex(meta.idx + 1);
      else render();
    });
  });

  function armSleep(min) {
    if (Root.__lxMusicSleep) clearTimeout(Root.__lxMusicSleep);
    Root.__lxMusicSleep = null;
    if (!min) { ui.toast('Таймер снят'); return; }
    Root.__lxMusicSleep = setTimeout(() => { pause(); ui.toast('Таймер сна остановил плеер'); }, min * 60000);
    ui.toast('Заснёт через ' + min + ' мин');
  }

  function renderPlay() {
    ui.setBack(null);
    ui.setTitle('файлы на устройстве', 'Музыка');
    const t = current();
    const esc = shell.esc;
    ui.body.innerHTML =
      '<div class="lx-card"><div class="lx-kicker">сейчас</div><h3>' + esc(t ? t.name : 'тишина') + '</h3>' +
      '<div class="lx-muted">' + esc(t && t.artist ? t.artist : (tracks.length + ' файлов в библиотеке')) + '</div></div>' +
      '<div class="lx-row">' +
        '<button type="button" class="lx-btn" data-act="prev">←</button>' +
        '<button type="button" class="lx-btn primary lx-grow" data-act="toggle">' + (playing() ? 'Пауза' : 'Играть') + '</button>' +
        '<button type="button" class="lx-btn" data-act="next">→</button></div>' +
      '<label class="lx-field">Громкость<input id="lx-vol" type="range" min="0" max="1" step="0.05" value="' + (meta.volume || 0.9) + '"></label>' +
      '<div class="lx-row"><span class="lx-muted lx-grow">Кроссфейд ' + (meta.fade || 0) + ' с</span>' +
        '<button type="button" class="lx-btn" data-act="fade" data-fade="0">0</button>' +
        '<button type="button" class="lx-btn" data-act="fade" data-fade="2">2</button>' +
        '<button type="button" class="lx-btn" data-act="fade" data-fade="5">5</button></div>' +
      '<div class="lx-row"><span class="lx-muted lx-grow">Таймер сна</span>' +
        '<button type="button" class="lx-btn" data-act="sleep" data-min="0">выкл</button>' +
        '<button type="button" class="lx-btn" data-act="sleep" data-min="15">15</button>' +
        '<button type="button" class="lx-btn" data-act="sleep" data-min="30">30</button>' +
        '<button type="button" class="lx-btn" data-act="sleep" data-min="60">60</button></div>' +
      '<div class="lx-row"><button type="button" class="lx-btn" data-act="go" data-view="queue">Очередь</button>' +
        '<button type="button" class="lx-btn" data-act="go" data-view="lib">Библиотека</button>' +
        '<button type="button" class="lx-btn" data-act="dj">DJ</button></div>';
    const vol = ui.body.querySelector('#lx-vol');
    vol.addEventListener('input', () => {
      meta.volume = Number(vol.value);
      audio.forEach((a) => { a.volume = meta.volume; });
      saveMeta();
    });
  }

  function renderQueue() {
    ui.setBack(() => { view = 'play'; render(); });
    ui.setTitle('этот порядок', 'Очередь');
    const esc = shell.esc;
    ui.body.innerHTML = '<div class="lx-list">' + (meta.queue.length ? meta.queue.map((id, i) => {
      const t = trackById(id);
      return '<div class="lx-card lx-row"><button type="button" class="lx-btn lx-grow" data-act="jump" data-i="' + i + '">' +
        (i === meta.idx ? '▸ ' : '') + esc(t ? ((t.artist ? t.artist + ' — ' : '') + t.name) : 'файл удалён') +
        '</button><button type="button" class="lx-icon" data-act="qdel" data-i="' + i + '">×</button></div>';
    }).join('') : '<div class="lx-empty">Добавь треки из библиотеки или попроси DJ.</div>') + '</div>' +
      '<label class="lx-field">Имя плейлиста<input id="lx-pl" maxlength="40" placeholder="ночная сцена"></label>' +
      '<button type="button" class="lx-btn" data-act="savepl">Сохранить очередь как плейлист</button>' +
      '<div class="lx-list">' + meta.playlists.map((pl, i) =>
        '<button type="button" class="lx-card" data-act="loadpl" data-i="' + i + '" style="text-align:left">' +
        esc(pl.name) + '<div class="lx-muted">' + pl.ids.length + ' треков</div></button>'
      ).join('') + '</div>';
  }

  function renderLib() {
    ui.setBack(() => { view = 'play'; render(); });
    ui.setTitle('ничего не стримится', 'Библиотека');
    const esc = shell.esc;
    ui.body.innerHTML =
      '<label class="lx-btn primary">Добавить файлы<input id="lx-files" type="file" accept="audio/*" multiple hidden></label>' +
      '<p class="lx-muted">Берутся файлы с устройства. Поиск по чужим каталогам, ролики и внешние плееры выключены.</p>' +
      '<div class="lx-list">' + tracks.map((t) =>
        '<div class="lx-card"><div class="lx-row"><strong class="lx-grow">' + esc(t.name) + '</strong>' +
        '<button type="button" class="lx-icon" data-act="del" data-id="' + esc(t.id) + '">×</button></div>' +
        '<div class="lx-muted">' + esc(t.artist || 'без артиста') + '</div>' +
        '<button type="button" class="lx-btn" data-act="enqueue" data-id="' + esc(t.id) + '">В очередь</button></div>'
      ).join('') + '</div>';
    ui.body.querySelector('#lx-files').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const base = f.name.replace(/\.[^.]+$/, '');
        const parts = base.split(' - ');
        const row = {
          id: 't' + Date.now().toString(36) + i.toString(36),
          name: (parts.length > 1 ? parts.slice(1).join(' - ') : base).slice(0, 120),
          artist: parts.length > 1 ? parts[0].slice(0, 80) : '',
          mime: f.type || 'audio/mpeg',
          blob: f,
        };
        try { await writeTrack(row); tracks.push(row); }
        catch (err) { ui.toast('Не записал ' + f.name); }
      }
      ui.toast('В библиотеке ' + tracks.length);
      render();
    });
  }

  function render() {
    if (view === 'queue') return renderQueue();
    if (view === 'lib') return renderLib();
    return renderPlay();
  }

  ui.body.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');
    if (act === 'go') { view = el.getAttribute('data-view'); render(); return; }
    if (act === 'toggle') { if (playing()) pause(); else playIndex(meta.idx || 0); return; }
    if (act === 'next') { playIndex((meta.idx || 0) + 1); return; }
    if (act === 'prev') { playIndex((meta.idx || 0) - 1); return; }
    if (act === 'fade') { meta.fade = Number(el.getAttribute('data-fade')); await saveMeta(); render(); return; }
    if (act === 'sleep') { armSleep(Number(el.getAttribute('data-min'))); return; }
    if (act === 'jump') { playIndex(Number(el.getAttribute('data-i'))); return; }
    if (act === 'qdel') {
      meta.queue.splice(Number(el.getAttribute('data-i')), 1);
      if (meta.idx >= meta.queue.length) meta.idx = 0;
      await saveMeta();
      render();
      return;
    }
    if (act === 'enqueue') {
      meta.queue.push(el.getAttribute('data-id'));
      await saveMeta();
      ui.toast('Добавлено в очередь');
      return;
    }
    if (act === 'del') {
      const id = el.getAttribute('data-id');
      await deleteTrack(id);
      if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; }
      tracks = tracks.filter((t) => t.id !== id);
      meta.queue = meta.queue.filter((x) => x !== id);
      await saveMeta();
      render();
      return;
    }
    if (act === 'savepl') {
      const name = (ui.body.querySelector('#lx-pl').value || '').trim() || ('плейлист ' + (meta.playlists.length + 1));
      meta.playlists.push({ name: name.slice(0, 40), ids: meta.queue.slice() });
      await saveMeta();
      ui.toast('Плейлист сохранён локально');
      render();
      return;
    }
    if (act === 'loadpl') {
      const pl = meta.playlists[Number(el.getAttribute('data-i'))];
      if (!pl) return;
      meta.queue = pl.ids.filter((id) => trackById(id));
      meta.idx = 0;
      await saveMeta();
      view = 'queue';
      render();
      return;
    }
    if (act === 'dj') {
      if (!tracks.length) { ui.toast('Сначала добавь файлы'); return; }
      ui.toast('DJ слушает сцену…');
      try {
        const msgs = await host.messages();
        const recent = msgs.slice(-8).map((m) => (m.role === 'user' ? 'Человек' : 'Персонаж') + ': ' + String(m.text || '').slice(0, 280)).join('\n');
        const raw = await host.generate(eng.djPrompt(tracks, recent));
        const ids = eng.parseIdList(raw, tracks.map((t) => t.id));
        if (!ids.length) { ui.toast('DJ не выбрал ни одного файла из библиотеки'); return; }
        meta.queue = ids;
        meta.idx = 0;
        await saveMeta();
        ui.toast('Очередь собрана из твоих файлов');
        view = 'queue';
        render();
      } catch (err) {
        ui.toast('DJ не ответил: ' + (err && err.message ? err.message : 'ошибка клиента'));
      }
    }
  });

  const open = async () => { await load(); view = 'play'; ui.open(); render(); };
  host.addMenu('Локальная музыка', open);
  shell.listen(shell.win(), 'open-music', 'local-music-open', open);
  return { open, close: () => ui.close() };
}

const LocalMusicApp = { boot: bootMusic };
globalThis.LocalMusicApp = LocalMusicApp;
export { LocalMusicApp };
