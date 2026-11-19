(function () {
  'use strict';

  /* =====================================================
     Лига Сукна — клиент
     Встреча = лобби на сервере. Все участники опрашивают его раз в ~2.5 с,
     поэтому приглашённый сразу видит ход матча и может отметить победителя.
     ===================================================== */

  const POLL_MS = 2500;
  const SPORTS = [
    { id: 'american', name: 'Американский пул', desc: 'Пул 8 / 9 / 10' },
    { id: 'russian', name: 'Русский бильярд', desc: 'Пирамида' }
  ];
  const SPORT_ART = {
    american:
      '<span class="mb" data-n="1" style="--c:#f4c20d;left:0;top:16px"></span>' +
      '<span class="mb" data-n="2" style="--c:#1f5fd0;left:24px;top:0"></span>' +
      '<span class="mb" data-n="8" style="--c:#151515;left:48px;top:16px"></span>',
    russian:
      '<span class="mb big" style="--c:#f3f0e4;left:0;top:10px"></span>' +
      '<span class="mb big" style="--c:#e6dfc9;left:30px;top:0"></span>' +
      '<span class="mb big" style="--c:#d6ccae;left:60px;top:14px"></span>'
  };
  const FORMAT_HINT = {
    free: 'От 2 до 4 игроков. Пары выбираете прямо во встрече — кто с кем играет. Считаются партии, винрейт общий и против каждого соперника.',
    tournament: 'Ровно 4 игрока: группа «каждый с каждым» и плей-офф Double Elimination.'
  };

  let tgUser = null;
  let lobby = null, lobbyId = null, lobbyVersion = 0;
  let state = null;                 // состояние турнира (из lobby.tournament)
  let selectedSport = 'american';
  let selectedFormat = 'free';
  let current = 'home';
  let userNavigated = false;
  let pollTimer = null, pollBusy = false, busy = 0;
  let pairPick = [];
  let playersCache = {};            // telegramId -> игрок из бота (фото, имя)
  let rosterList = [];
  let statsData = null;
  let tFinishing = false;
  const shown = {};                 // lobbyId -> итоги уже показаны

  /* ---------- утилиты ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function isTgId(id) { return /^\d{3,}$/.test(String(id || '')); }
  function myId() { return tgUser && tgUser.id ? String(tgUser.id) : ''; }
  function plainMoney(n) { return (Math.round(Number(n) || 0)).toLocaleString('ru-RU') + ' ₽'; }
  function money(n) {
    const v = Math.round(Number(n) || 0);
    return (v > 0 ? '+' : (v < 0 ? '−' : '')) + Math.abs(v).toLocaleString('ru-RU') + ' ₽';
  }
  function initial(n) { return String(n || '?').trim().slice(0, 1).toUpperCase(); }
  function pct(w, g) { return g > 0 ? Math.round((w / g) * 100) : 0; }
  function sportName(id) { const s = SPORTS.find(x => x.id === id); return s ? s.name : 'Бильярд'; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = $('screen-' + id);
    if (el) el.classList.add('active');
    current = id;
    if (id !== 'home') userNavigated = true;
    else updateResume();
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg || 'Сохранено';
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 1900);
  }
  function haptic(kind) {
    try {
      const h = window.Telegram && Telegram.WebApp && Telegram.WebApp.HapticFeedback;
      if (!h) return;
      if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
      else h.impactOccurred(kind || 'light');
    } catch (e) {}
  }
  function inTelegram() {
    try { return !!(window.Telegram && Telegram.WebApp && Telegram.WebApp.initData); } catch (e) { return false; }
  }
  function notify(msg, cb) {
    try {
      const tw = window.Telegram && Telegram.WebApp;
      if (inTelegram() && tw.isVersionAtLeast && tw.isVersionAtLeast('6.2')) {
        tw.showAlert(String(msg), function () { if (cb) cb(); });
        return;
      }
    } catch (e) {}
    alert(msg);
    if (cb) cb();
  }
  function askConfirm(msg, onYes) {
    try {
      const tw = window.Telegram && Telegram.WebApp;
      if (inTelegram() && tw.isVersionAtLeast && tw.isVersionAtLeast('6.2')) {
        tw.showConfirm(String(msg), function (ok) { if (ok) onYes(); });
        return;
      }
    } catch (e) {}
    if (confirm(msg)) onYes();
  }
  function openOverlay(id) { $(id).classList.add('active'); }
  function closeOverlay(id) { $(id).classList.remove('active'); }

  function ensureUser() {
    if (!tgUser) {
      tgUser = { id: 'g' + Date.now().toString(36), name: 'Игрок', username: '', guest: true };
      Storage.setMe(tgUser);
    }
    return tgUser;
  }

  function avatarHtml(p, cls, photo) {
    const c = p && p.id && playersCache[p.id];
    const mine = tgUser && p && String(p.id) === myId();
    const url = photo || (c && c.photoUrl) || (mine && tgUser.photoUrl) || '';
    const k = cls ? ' ' + cls : '';
    if (url) return '<img class="avatar' + k + '" src="' + esc(url) + '" alt="">';
    return '<div class="avatar ph' + k + '">' + esc(initial(p && p.name)) + '</div>';
  }

  /* ---------- Telegram ---------- */
  function initTelegram() {
    if (window.Telegram && Telegram.WebApp) {
      const tw = Telegram.WebApp;
      try { tw.ready(); tw.expand(); } catch (e) {}
      try { tw.setHeaderColor('#050d0a'); tw.setBackgroundColor('#050d0a'); } catch (e) {}
      try { if (tw.disableVerticalSwipes) tw.disableVerticalSwipes(); } catch (e) {}
      const u = tw.initDataUnsafe && tw.initDataUnsafe.user;
      if (u && u.id) {
        tgUser = {
          id: String(u.id),
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || ('ID ' + u.id),
          username: u.username || null,
          photoUrl: u.photo_url || ''
        };
        Storage.setMe(tgUser);
        if (Api.enabled()) {
          Api.ensureMe({ telegramId: tgUser.id, name: tgUser.name, username: tgUser.username || '' }).catch(function () {});
        }
      }
    }
    if (!tgUser) tgUser = Storage.getMe();
    updateBadges();
  }

  function updateBadges() {
    const me = $('me-badge');
    if (me) {
      if (tgUser && tgUser.id && !tgUser.guest) me.textContent = 'Вы: ' + tgUser.name + ' · ID ' + tgUser.id;
      else me.textContent = 'Откройте через Telegram-бота — так игра привяжется к вашему профилю';
    }
    const api = $('api-badge');
    if (!api) return;
    if (!Api.enabled()) {
      api.textContent = 'Облако не настроено (config.js)';
      api.className = 'api-badge warn';
      return;
    }
    api.textContent = 'Проверяем связь…';
    api.className = 'api-badge';
    Api.ping().then(function () {
      api.textContent = 'Облако онлайн';
      api.className = 'api-badge ok';
    }).catch(function () {
      api.textContent = 'Нет связи с таблицей';
      api.className = 'api-badge warn';
    });
  }

  /* ---------- интро: камера подлетает к столу ---------- */
  function buildIntro() {
    const felt = $('intro-felt');
    if (!felt) return;

    const colors = ['#f4c20d', '#1f5fd0', '#d3281f', '#5d2d91', '#f0701a', '#1b8a42', '#8a2323'];
    const D = 24;
    // центр пирамиды на сукне (координаты относительно felt)
    const rackCx = 120;
    const rackCy = 168;
    // позиция битка (ниже пирамиды)
    const cueX = 120;
    const cueY = 340;
    // верхняя-левая луза (цель)
    const pocketX = 6;
    const pocketY = 6;

    // биток
    const cue = document.createElement('i');
    cue.className = 'ibl cue';
    cue.style.left = cueX + 'px';
    cue.style.top = cueY + 'px';
    cue.style.setProperty('--hit-x', (rackCx - cueX) + 'px');
    cue.style.setProperty('--hit-y', (rackCy + 28 - cueY) + 'px');
    felt.appendChild(cue);

    // пирамида 5 рядов (15 шаров)
    let i = 0;
    let targetEl = null;
    for (let r = 0; r < 5; r++) {
      for (let k = 0; k <= r; k++, i++) {
        const x = rackCx + (k - r / 2) * D;
        const y = rackCy - r * (D * 0.86);
        const b = document.createElement('i');
        const isTarget = (r === 2 && k === 0); // крайний шар ближе к верхней лузе
        b.className = 'ibl' + (i >= 8 ? ' stripe' : '') + (isTarget ? ' target' : ' scatter');
        b.style.setProperty('--c', i === 4 ? '#151515' : colors[i % 7]);
        b.style.left = x.toFixed(1) + 'px';
        b.style.top = y.toFixed(1) + 'px';

        if (isTarget) {
          b.style.setProperty('--dx', (pocketX - x) + 'px');
          b.style.setProperty('--dy', (pocketY - y) + 'px');
          b.style.setProperty('--mid-x', ((pocketX - x) * 0.35) + 'px');
          b.style.setProperty('--mid-y', ((pocketY - y) * 0.45 - 20) + 'px');
          targetEl = b;
        } else {
          // разлёт от центра пирамиды
          const ang = Math.atan2(y - rackCy, x - rackCx) + (Math.random() - 0.5) * 0.8;
          const dist = 55 + Math.random() * 90 + r * 8;
          let dx = Math.cos(ang) * dist;
          let dy = Math.sin(ang) * dist - 20;
          // не уводим целевую зону лузы слишком похоже
          dx = Math.max(-100, Math.min(100, dx));
          dy = Math.max(-140, Math.min(120, dy));
          b.style.setProperty('--dx', dx.toFixed(1) + 'px');
          b.style.setProperty('--dy', dy.toFixed(1) + 'px');
          b.style.setProperty('--rot', Math.round(-280 + Math.random() * 560) + 'deg');
        }
        felt.appendChild(b);
      }
    }
  }

  function runIntro() {
    const el = $('intro');
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!el || reduce) {
      if (el) el.remove();
      document.body.classList.add('ready');
      return;
    }
    let ended = false;
    function end(fast) {
      if (ended) return;
      ended = true;
      el.classList.add(fast ? 'skip' : 'done');
      document.body.classList.add('ready');
      setTimeout(function () {
        try { el.remove(); } catch (e) {}
      }, fast ? 400 : 200);
    }
    const skip = $('intro-skip');
    if (skip) skip.addEventListener('click', function (e) {
      e.stopPropagation();
      end(true);
    });
    el.addEventListener('click', function () { end(true); });
    // полная длина сцены ~5.2s + небольшой хвост
    setTimeout(function () { document.body.classList.add('ready'); }, 4800);
    setTimeout(function () { end(false); }, 5400);
  }

  /* ---------- главная ---------- */
  function renderHome() {
    const grid = $('sport-grid');
    grid.innerHTML = SPORTS.map(s =>
      '<div class="sport-card" data-sport="' + s.id + '">' +
        '<div class="sport-art">' + SPORT_ART[s.id] + '</div>' +
        '<h3>' + s.name + '</h3><p>' + s.desc + '</p></div>'
    ).join('');
    grid.querySelectorAll('.sport-card').forEach(card => {
      card.addEventListener('click', () => {
        if (lobby && lobby.status === 'live') {
          notify('Встреча ещё идёт. Вернитесь к ней (карточка над столами) и завершите, прежде чем начинать новую.');
          return;
        }
        selectedSport = card.dataset.sport;
        openSetup();
      });
    });
  }

  function updateResume() {
    const el = $('resume-card');
    if (!el) return;
    const l = lobby;
    const show = l && (l.status === 'live' || (l.status === 'open' && String(l.hostId) !== myId()));
    if (!show) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = '▶️ Вернуться к встрече<small>' + esc(sportName(l.sport)) + ' · ' +
      (l.status === 'live' ? 'идёт игра' : 'ждём старт') + '</small>';
  }

  /* ---------- настройка встречи ---------- */
  function readBet() { return Math.max(0, parseInt($('setup-bet').value, 10) || 0); }

  function openSetup() {
    userNavigated = true;
    resetLobbyState(true);
    selectedFormat = 'free';
    document.querySelectorAll('#format-chips .chip').forEach(c => c.classList.toggle('active', c.dataset.format === 'free'));
    $('setup-bet').value = 500;
    const sport = SPORTS.find(s => s.id === selectedSport);
    $('setup-title').textContent = sport ? sport.name : 'Встреча';
    updateSetupForm();
    showScreen('setup');
  }

  function resetLobbyState(cancelOpen) {
    if (cancelOpen && lobby && lobby.status === 'open' && String(lobby.hostId) === myId() && Api.enabled()) {
      Api.cancelLobby(lobby.id, myId()).catch(function () {});
    }
    stopPolling();
    lobby = null; lobbyId = null; lobbyVersion = 0; state = null; pairPick = []; tFinishing = false;
  }

  function updateSetupForm() {
    const free = selectedFormat === 'free';
    $('format-hint').textContent = FORMAT_HINT[selectedFormat];
    $('bet-label').textContent = free ? 'Ставка за партию (0 — без денег)' : 'Ставка за проигрыш';
    $('players-label').textContent = free ? 'Участники (2–4 игрока)' : 'Участники (ровно 4)';

    const real = !!(tgUser && isTgId(tgUser.id));
    const hostName = (tgUser && tgUser.name) || 'Вы';
    $('player-inputs').innerHTML =
      '<div class="host-card">' +
        avatarHtml({ id: myId(), name: hostName }, 'lg') +
        '<div class="host-info">' +
          '<input type="text" id="host-name" value="' + esc(hostName) + '" maxlength="24"' + (real ? ' readonly' : '') + '>' +
          '<div class="hint" style="margin:0">Вы · инициатор' +
            (real ? ' · ID ' + esc(tgUser.id) : ' · откройте через бота, чтобы звать друзей') + '</div>' +
        '</div></div>' +
      '<div class="field-block"><label>Позвать из бота</label>' +
        '<div id="roster-grid" class="roster-grid"><div class="hint">Загрузка…</div></div>' +
        '<div id="picked-list" class="picked-list"></div>' +
        '<p class="hint">В списке те, кто хотя бы раз нажал Start у бота. Нажми на карточку — игроку уйдёт приглашение, и он сразу попадёт в матч.</p></div>' +
      '<div class="field-block"><label>Или добавь игрока вручную</label>' +
        '<div id="manual-players"></div>' +
        '<button type="button" class="chip" id="btn-add-manual">＋ Ещё игрок</button></div>';

    const rows = free ? 1 : 3;
    for (let i = 0; i < rows; i++) addManualRow();
    $('btn-add-manual').addEventListener('click', addManualRow);
    $('host-name').addEventListener('input', updateSetupCount);

    if (rosterList.length) renderRoster(); else loadRoster();
    renderPicked();
    updateSetupCount();
  }

  function addManualRow() {
    const wrap = $('manual-players');
    if (!wrap) return;
    if (wrap.querySelectorAll('.p-name-extra').length >= 3) return;
    const div = document.createElement('div');
    div.className = 'manual-row';
    div.innerHTML = '<input type="text" class="p-name-extra" placeholder="Имя игрока" maxlength="24">';
    wrap.appendChild(div);
    div.querySelector('input').addEventListener('input', updateSetupCount);
    const btn = $('btn-add-manual');
    if (btn) btn.style.display = wrap.querySelectorAll('.p-name-extra').length >= 3 ? 'none' : '';
  }

  function loadRoster() {
    const grid = $('roster-grid');
    if (!grid) return;
    if (!Api.enabled()) {
      grid.innerHTML = '<div class="hint">Облако не настроено — список игроков из бота недоступен</div>';
      return;
    }
    Api.getPlayers().then(function (players) {
      rosterList = (players || []).filter(p => p.telegramId);
      rosterList.forEach(p => { playersCache[p.telegramId] = p; });
      renderRoster();
    }).catch(function () {
      const g = $('roster-grid');
      if (g) g.innerHTML = '<div class="hint">Не удалось загрузить список игроков</div>';
    });
  }

  function invitedMap() {
    const m = {};
    ((lobby && lobby.players) || []).forEach(p => {
      if (p.status === 'invited' || p.status === 'accepted') m[p.id] = p.status;
    });
    return m;
  }

  function renderRoster() {
    const grid = $('roster-grid');
    if (!grid) return;
    const me = myId();
    const list = rosterList.filter(p => String(p.telegramId) !== me);
    if (!rosterList.length) {
      grid.innerHTML = '<div class="hint">В таблице пока нет игроков. Открой бота → /start — ты появишься в базе. Друзья тоже должны нажать Start.</div>';
      return;
    }
    if (!list.length) {
      grid.innerHTML = '<div class="hint">В боте пока только вы. Когда друг нажмёт Start у бота, он появится здесь.</div>';
      return;
    }
    const inv = invitedMap();
    grid.innerHTML = list.map(p => {
      const st = inv[p.telegramId];
      return '<button type="button" class="roster-card' + (st ? ' invited' : '') + '" data-id="' + esc(p.telegramId) +
        '" data-name="' + esc(p.name || '') + '">' +
        avatarHtml({ id: p.telegramId, name: p.name }) +
        '<span class="roster-name">' + esc(p.name || 'Игрок') + '</span>' +
        '<span class="roster-badge">' + (st === 'accepted' ? '✓ в игре' : (st ? 'ждём' : '')) + '</span></button>';
    }).join('');
    grid.querySelectorAll('.roster-card').forEach(card => {
      card.addEventListener('click', () => onPickPlayer(card.dataset.id, card.dataset.name, card));
    });
  }

  function renderPicked() {
    const el = $('picked-list');
    if (!el) return;
    const arr = ((lobby && lobby.players) || []).filter(p => p.status !== 'host' && p.status !== 'viewer');
    if (!arr.length) { el.innerHTML = ''; return; }
    const ico = { invited: '⏳', accepted: '✅', declined: '❌' };
    el.innerHTML = arr.map(p =>
      '<span class="picked-chip st-' + esc(p.status) + '">' + (ico[p.status] || '') + ' ' + esc(p.name) +
      '<button type="button" class="chip-x" data-id="' + esc(p.id) + '" aria-label="Убрать">✕</button></span>'
    ).join('');
    el.querySelectorAll('.chip-x').forEach(b => b.addEventListener('click', () => onRemovePlayer(b.dataset.id)));
  }

  function collectParticipants() {
    const u = tgUser || { id: '', name: 'Вы' };
    const hostInput = $('host-name');
    const hostName = ((hostInput && hostInput.value) || u.name || 'Вы').trim();
    const out = [{ id: String(u.id || ''), name: hostName, username: u.username || '' }];
    ((lobby && lobby.players) || []).forEach(p => {
      if (p.status === 'host' || p.status === 'declined' || p.status === 'viewer') return;
      out.push({ id: String(p.id), name: p.name, username: p.username || '' });
    });
    document.querySelectorAll('.p-name-extra').forEach(inp => {
      const name = inp.value.trim();
      if (name) out.push({ id: '', name: name, username: '' });
    });
    return out;
  }

  function updateSetupCount() {
    const el = $('setup-count');
    if (!el) return;
    const n = collectParticipants().length;
    const free = selectedFormat === 'free';
    const ok = free ? (n >= 2 && n <= 4) : n === 4;
    el.className = 'setup-count ' + (ok ? 'ok' : 'warn');
    el.textContent = 'Участников: ' + n + (free ? ' · нужно от 2 до 4' : ' · нужно ровно 4');
    $('btn-start').disabled = !ok;
  }

  function onPickPlayer(toId, toName, card) {
    if (!tgUser || !isTgId(tgUser.id)) {
      notify('Откройте приложение через бота — так ваш ID привяжется к профилю и приглашения заработают.');
      return;
    }
    if (!Api.enabled()) { notify('Нужен API таблицы (config.js)'); return; }
    if (invitedMap()[toId]) { toast('Уже приглашён'); return; }
    if (collectParticipants().length >= 4) { notify('Во встрече максимум 4 игрока'); return; }

    askConfirm('Отправить приглашение игроку «' + toName + '»?', function () {
      if (card) card.classList.add('sending');
      const hostName = (($('host-name') && $('host-name').value) || tgUser.name).trim();
      const ensure = lobbyId
        ? Promise.resolve({ ok: true, lobby: lobby })
        : Api.createLobby({ hostId: tgUser.id, hostName: hostName, hostUsername: tgUser.username || '',
            sport: selectedSport, format: selectedFormat, bet: readBet() });
      ensure.then(function (res) {
        if (!res || !res.lobby) throw new Error('не удалось создать встречу');
        lobby = res.lobby; lobbyId = lobby.id; lobbyVersion = lobby.version || 0;
        return Api.inviteById(lobbyId, toId, toName);
      }).then(function (res) {
        if (card) card.classList.remove('sending');
        if (!res || !res.ok) {
          notify('Не удалось отправить: ' + ((res && res.error) || 'ошибка') +
            '\nИгрок должен хотя бы раз нажать Start у бота.');
          return;
        }
        lobby = res.lobby; lobbyVersion = lobby.version || 0;
        renderPicked(); renderRoster(); updateSetupCount();
        startPolling();
        haptic('success');
        toast('Приглашение отправлено');
      }).catch(function (e) {
        if (card) card.classList.remove('sending');
        notify('Ошибка: ' + (e.message || e));
      });
    });
  }

  function onRemovePlayer(id) {
    if (!lobbyId) return;
    Api.removeFromLobby(lobbyId, myId(), id).then(function (res) {
      if (res && res.lobby) { lobby = res.lobby; lobbyVersion = lobby.version || 0; }
      renderPicked(); renderRoster(); updateSetupCount();
    }).catch(function () { toast('Нет связи'); });
  }

  function onStart() {
    if (!Api.enabled()) { notify('Облако не настроено (config.js) — без него встреча не работает.'); return; }
    const u = ensureUser();
    const parts = collectParticipants();
    const free = selectedFormat === 'free';
    if (free ? (parts.length < 2 || parts.length > 4) : parts.length !== 4) {
      notify(free ? 'Нужно от 2 до 4 игроков' : 'Для турнира нужно ровно 4 игрока');
      return;
    }
    const names = new Set(parts.map(p => p.name.toLowerCase()));
    if (names.size !== parts.length) { notify('Имена игроков должны быть разными'); return; }
    if (!u.name || u.guest) { u.name = parts[0].name; Storage.setMe(u); }

    const bet = readBet();
    const payload = {
      lobbyId: lobbyId || '', byId: String(u.id), hostName: parts[0].name, hostUsername: u.username || '',
      sport: selectedSport, format: selectedFormat, bet: bet, participants: parts
    };
    if (!free) {
      const st = Tournament.createEmptyState(
        parts.map(p => ({ name: p.name, telegramId: isTgId(p.id) ? p.id : null })), bet, 'group-de');
      st.sport = selectedSport;
      Tournament.recalcBracket(st);
      payload.tournament = st;
    }

    const btn = $('btn-start');
    btn.disabled = true;
    busy++;
    Api.startLobby(payload).then(function (res) {
      if (!res || !res.ok || !res.lobby) throw new Error((res && res.error) || 'Не удалось начать встречу');
      haptic('success');
      enterLobby(res.lobby);
    }).catch(function (e) {
      notify('Ошибка: ' + (e.message || e));
    }).finally(function () {
      busy--;
      updateSetupCount();
    });
  }

  function onSetupBack() {
    resetLobbyState(true);
    Storage.clearCurrent();
    showScreen('home');
  }

  /* ---------- лобби: вход, опрос, переходы ---------- */
  function getLobbyParam() {
    let id = '';
    try { id = new URLSearchParams(location.search).get('lobby') || ''; } catch (e) {}
    if (!id) {
      try {
        const sp = Telegram.WebApp.initDataUnsafe.start_param || '';
        if (/^(lobby_|join_)/.test(sp)) id = sp.replace(/^(lobby_|join_)/, '');
      } catch (e) {}
    }
    if (id) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
    return id;
  }

  /** Приглашённый открыл ссылку/кнопку: добавляем в лобби и сразу ведём в матч. */
  function openLobbyById(id) {
    const me = tgUser && tgUser.id ? { id: tgUser.id, name: tgUser.name, username: tgUser.username || '' } : null;
    const req = me
      ? Api.joinLobby(id, me)
      : Api.getLobby(id).then(d => ({ ok: !!(d && d.lobby), lobby: d && d.lobby }));
    req.then(function (res) {
      if (!res || !res.lobby) { toast('Встреча не найдена'); showScreen('home'); return; }
      enterLobby(res.lobby);
    }).catch(function () {
      toast('Нет связи с сервером');
    });
  }

  function enterLobby(l) {
    if (!l) return;
    lobby = l; lobbyId = l.id; lobbyVersion = l.version || 0; pairPick = []; tFinishing = false;
    if (l.status === 'cancelled') { handleCancelled(); return; }
    if (l.status === 'finished') { handleFinished(l); return; }
    Storage.setCurrent({ type: 'lobby', lobbyId: l.id });
    loadPlayersCache();
    showLobbyScreen();
    startPolling();
  }

  function showLobbyScreen() {
    const l = lobby;
    if (!l) return;
    if (l.format === 'tournament' && l.status === 'live' && l.tournament) {
      state = l.tournament;
      renderTournament();
      if (current !== 'tournament') showScreen('tournament');
      if (!busy && Tournament.isFinished(state)) finishTournament();
    } else {
      renderMatch();
      if (current !== 'match') showScreen('match');
    }
  }

  function applyLobby(l) {
    if (!l || (lobbyId && l.id !== lobbyId)) return;
    if (lobbyVersion >= 0 && (l.version || 0) < lobbyVersion) return; // устаревший ответ
    lobby = l; lobbyVersion = l.version || 0;
    if (l.status === 'cancelled') { handleCancelled(); return; }
    if (l.status === 'finished') { handleFinished(l); return; }
    if (current === 'setup') { renderPicked(); renderRoster(); updateSetupCount(); return; }
    if (current === 'match' || current === 'tournament') {
      if (pairPick.length && l.match && l.match.pair) pairPick = [];
      showLobbyScreen();
    } else {
      updateResume();
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(pollTick, POLL_MS);
  }
  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null; pollBusy = false;
  }
  function pollTick() {
    if (!lobbyId || pollBusy || busy > 0 || document.hidden) return;
    pollBusy = true;
    const id = lobbyId;
    Api.getLobby(id, lobbyVersion).then(function (d) {
      if (id !== lobbyId || busy > 0) return;
      if (d && d.lobby) applyLobby(d.lobby);
    }).catch(function () {}).finally(function () { pollBusy = false; });
  }

  function leaveLobby() {
    stopPolling();
    lobby = null; lobbyId = null; lobbyVersion = 0; state = null; pairPick = []; tFinishing = false;
    Storage.clearCurrent();
    updateResume();
  }
  function handleCancelled() {
    leaveLobby();
    toast('Встреча отменена');
    showScreen('home');
  }
  function handleFinished(l) {
    stopPolling();
    Storage.clearCurrent();
    if (shown[l.id]) return;
    shown[l.id] = true;
    if (l.format === 'tournament') showTournamentFinal(l.tournament || state);
    else showMatchFinal(l);
    haptic('success');
  }

  function canAct(l) {
    l = l || lobby;
    const id = myId();
    if (!l || !id) return false;
    return String(l.hostId) === id || (l.participants || []).some(p => p.id && String(p.id) === id);
  }

  function loadPlayersCache() {
    if (!Api.enabled()) return;
    Api.getPlayers().then(function (list) {
      (list || []).forEach(p => { if (p.telegramId) playersCache[p.telegramId] = p; });
      if (!rosterList.length) rosterList = (list || []).filter(p => p.telegramId);
      if (current === 'match' && lobby) renderMatch();
      if (current === 'stats' && statsData) renderStats(statsData);
    }).catch(function () {});
  }

  /* ---------- матч: свободный формат ---------- */
  function tally(l) {
    const P = l.participants || [];
    const games = (l.match && l.match.games) || [];
    const wins = P.map(() => 0), losses = P.map(() => 0), pairs = {};
    games.forEach(g => {
      const loser = g.w === g.a ? g.b : g.a;
      wins[g.w]++; losses[loser]++;
      const a = Math.min(g.a, g.b), b = Math.max(g.a, g.b), k = a + '-' + b;
      const o = pairs[k] || (pairs[k] = { a: a, b: b, aw: 0, bw: 0 });
      if (g.w === a) o.aw++; else o.bw++;
    });
    return { wins: wins, losses: losses, games: games, pairs: Object.keys(pairs).map(k => pairs[k]) };
  }

  function renderWaiting(l, body) {
    const label = { host: 'Инициатор', accepted: 'В игре', invited: 'Ждём ответа…', declined: 'Отказался' };
    const cls = { accepted: 'ok', declined: 'bad', host: 'ok' };
    const list = (l.players || []).filter(p => p.status !== 'viewer');
    body.innerHTML =
      '<div class="panel wait-card"><div class="pulse-dot"></div><h3>Встреча готовится</h3>' +
        '<p class="hint">Инициатор ' + esc(l.hostName) + ' собирает игроков. Как только он нажмёт «Начать», матч откроется здесь автоматически — ничего нажимать не нужно.</p></div>' +
      '<div class="panel"><div class="panel-head"><h3>Игроки</h3></div>' +
        list.map(p =>
          '<div class="wait-item">' + avatarHtml(p, 'sm') + '<span class="nm">' + esc(p.name) +
          (String(p.id) === myId() ? ' · вы' : '') + '</span><span class="wait-state ' + (cls[p.status] || '') + '">' +
          (label[p.status] || '') + '</span></div>'
        ).join('') + '</div>' +
      '<div class="match-actions"><button class="ghost-btn" id="btn-match-home">На главную</button></div>';
    $('btn-match-home').addEventListener('click', () => showScreen('home'));
  }

  function renderMatch() {
    const l = lobby;
    if (!l) return;
    const body = $('match-body');
    const bet = Number(l.bet) || 0;
    $('match-title').textContent = sportName(l.sport);
    $('match-sub').textContent = (l.format === 'tournament' ? 'Турнир 4×4' : 'Свободная встреча') +
      (bet ? ' · ' + plainMoney(bet) + (l.format === 'tournament' ? '' : '/партия') : '');

    if (l.status !== 'live' || !l.match) {
      $('match-count').textContent = '—';
      renderWaiting(l, body);
      return;
    }

    const P = l.participants || [];
    const t = tally(l);
    const games = t.games;
    const meId = myId();
    const act = canAct(l);
    const pair = l.match.pair || (P.length === 2 ? { a: 0, b: 1 } : null);
    const gameNo = games.length + 1;
    const isMe = i => !!P[i].id && String(P[i].id) === meId;
    $('match-count').textContent = String(games.length);

    let html = '';

    // --- счёт
    if (P.length === 2) {
      const side = i => '<div class="duel-side' + (isMe(i) ? ' me' : '') + '">' + avatarHtml(P[i], 'lg') +
        '<div class="duel-name">' + esc(P[i].name) + '</div>' +
        '<div class="tile-meta">' + pct(t.wins[i], t.wins[i] + t.losses[i]) + '% побед</div></div>';
      html += '<div class="panel duel">' + side(0) +
        '<div class="duel-score"><b>' + t.wins[0] + '</b><i>:</i><b>' + t.wins[1] + '</b></div>' + side(1) + '</div>';
      if (bet) {
        const n0 = (t.wins[0] - t.losses[0]) * bet;
        html += '<p class="hint" style="text-align:center;margin:-6px 0 0">Баланс: ' + esc(P[0].name) + ' ' + money(n0) +
          ' · ' + esc(P[1].name) + ' ' + money(-n0) + '</p>';
      }
    } else {
      html += '<div class="tile-grid">' + P.map((p, i) => {
        const g = t.wins[i] + t.losses[i];
        const net = (t.wins[i] - t.losses[i]) * bet;
        const inPair = pair && (pair.a === i || pair.b === i);
        return '<div class="p-tile' + (isMe(i) ? ' me' : '') + (inPair ? ' in-pair' : '') + '">' + avatarHtml(p) +
          '<div class="tile-name">' + esc(p.name) + (isMe(i) ? ' · вы' : '') + '</div>' +
          '<div class="tile-score">' + t.wins[i] + '<i>:</i>' + t.losses[i] + '</div>' +
          '<div class="tile-meta">винрейт ' + pct(t.wins[i], g) + '%</div>' +
          (bet ? '<div class="tile-net ' + (net > 0 ? 'plus' : (net < 0 ? 'minus' : '')) + '">' + money(net) + '</div>' : '') +
          '</div>';
      }).join('') + '</div>';
    }

    // --- текущая партия
    html += '<div class="panel"><div class="panel-head"><h3>Партия ' + gameNo + '</h3></div>';
    if (!act) html += '<p class="hint" style="margin:0 0 10px">Вы наблюдаете за встречей — отметить победителя могут участники.</p>';
    if (pair) {
      html += '<div class="win-row">' +
        '<button class="win-btn" data-w="' + pair.a + '"' + (act ? '' : ' disabled') + '>' + avatarHtml(P[pair.a]) +
          '<span>' + esc(P[pair.a].name) + '</span><em>победил</em></button>' +
        '<span class="vs-badge">VS</span>' +
        '<button class="win-btn" data-w="' + pair.b + '"' + (act ? '' : ' disabled') + '>' + avatarHtml(P[pair.b]) +
          '<span>' + esc(P[pair.b].name) + '</span><em>победил</em></button></div>' +
        '<p class="hint">Нажми на победителя. Засчитывается первое нажатие — кто успел, тот и записал.</p>';
      if (P.length > 2 && act) html += '<button class="text-btn" id="btn-change-pair" style="margin-top:10px">Сменить пару</button>';
    } else {
      html += '<p class="hint" style="margin:0">Кто играет эту партию? Выберите двух игроков.</p><div class="pick-row">' +
        P.map((p, i) => '<button class="pick-chip' + (pairPick.indexOf(i) >= 0 ? ' sel' : '') + '" data-i="' + i + '"' +
          (act ? '' : ' disabled') + '>' + esc(p.name) + '</button>').join('') + '</div>';
      if (pairPick.length === 2) {
        html += '<button class="primary-btn small" id="btn-set-pair">Играют: ' + esc(P[pairPick[0]].name) +
          ' — ' + esc(P[pairPick[1]].name) + '</button>';
      }
    }
    html += '</div>';

    // --- личные счёты в этой встрече (для 3–4 игроков)
    if (P.length > 2 && t.pairs.length) {
      html += '<div class="panel"><div class="panel-head"><h3>Личные счёты</h3></div>' +
        t.pairs.map(pr => {
          const g = pr.aw + pr.bw;
          return '<div class="debt-card neutral"><span><b>' + esc(P[pr.a].name) + '</b> — <b>' + esc(P[pr.b].name) +
            '</b> <span style="color:var(--text-dim)">(' + pct(pr.aw, g) + '% / ' + pct(pr.bw, g) + '%)</span></span>' +
            '<span class="debt-cash neutral">' + pr.aw + ' : ' + pr.bw + '</span></div>';
        }).join('') + '</div>';
    }

    // --- ход встречи
    if (games.length) {
      html += '<div class="panel"><div class="panel-head"><h3>Ход встречи</h3></div><div class="game-list">' +
        games.slice().reverse().map((g, ri) => {
          const loser = g.w === g.a ? g.b : g.a;
          const tm = new Date(g.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
          return '<div class="game-item"><span class="game-no">№' + g.n + '</span>' +
            '<span class="game-text"><b>' + esc(P[g.w].name) + '</b> победил ' + esc(P[loser].name) + '</span>' +
            (ri === 0 && act ? '<button class="undo-btn" id="btn-undo">Отменить</button>' : '<span class="game-time">' + tm + '</span>') +
            '</div>';
        }).join('') + '</div></div>';
    }

    html += '<div class="match-actions">' +
      (act ? '<button class="primary-btn" id="btn-finish-match">Завершить встречу</button>' : '') +
      '<button class="ghost-btn" id="btn-match-home">На главную</button></div>';

    body.innerHTML = html;

    body.querySelectorAll('.win-btn').forEach(b => b.addEventListener('click', () => onWinner(+b.dataset.w)));
    body.querySelectorAll('.pick-chip').forEach(b => b.addEventListener('click', () => {
      const i = +b.dataset.i, at = pairPick.indexOf(i);
      if (at >= 0) pairPick.splice(at, 1);
      else { if (pairPick.length >= 2) pairPick.shift(); pairPick.push(i); }
      haptic('light');
      renderMatch();
    }));
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('btn-set-pair', onSetPair);
    on('btn-change-pair', onChangePair);
    on('btn-undo', onUndo);
    on('btn-finish-match', onFinishMatch);
    on('btn-match-home', () => showScreen('home'));
  }

  function netError() { lobbyVersion = -1; toast('Нет связи — проверьте интернет'); }

  function onWinner(idx) {
    const l = lobby;
    if (!l || l.status !== 'live' || !l.match || !canAct(l) || busy) return;
    const P = l.participants, games = l.match.games;
    const pair = l.match.pair || (P.length === 2 ? { a: 0, b: 1 } : null);
    if (!pair || (idx !== pair.a && idx !== pair.b)) return;
    const n = games.length + 1;
    haptic('medium');

    // мгновенно показываем у себя, сервер подтвердит (или откатит, если кто-то успел раньше)
    games.push({ n: n, a: pair.a, b: pair.b, w: idx, at: new Date().toISOString(), by: myId() });
    l.match.pair = P.length === 2 ? { a: 0, b: 1 } : null;
    pairPick = [];
    renderMatch();

    busy++;
    Api.recordGame(l.id, myId(), n, idx).then(function (res) {
      if (res && res.lobby) { lobbyVersion = -1; applyLobby(res.lobby); }
      if (res && res.ok) { toast('Партия записана'); haptic('success'); }
      else if (res && res.error === 'stale') { toast('Победителя уже отметил другой игрок'); haptic('warning'); }
      else if (res && res.error) notify(res.error);
    }).catch(netError).finally(function () { busy--; });
  }

  function onSetPair() {
    if (pairPick.length !== 2 || busy) return;
    const a = Math.min(pairPick[0], pairPick[1]), b = Math.max(pairPick[0], pairPick[1]);
    busy++;
    Api.setPair(lobbyId, myId(), a, b).then(function (res) {
      pairPick = [];
      if (res && res.lobby) { lobbyVersion = -1; applyLobby(res.lobby); }
      if (res && !res.ok) toast(res.error === 'conflict' ? 'Пару уже выбрал другой игрок' : (res.error || 'Ошибка'));
    }).catch(netError).finally(function () { busy--; });
  }

  function onChangePair() {
    if (busy) return;
    busy++;
    Api.setPair(lobbyId, myId(), null, null).then(function (res) {
      pairPick = [];
      if (res && res.lobby) { lobbyVersion = -1; applyLobby(res.lobby); }
    }).catch(netError).finally(function () { busy--; });
  }

  function onUndo() {
    if (busy) return;
    askConfirm('Отменить последнюю партию?', function () {
      busy++;
      Api.undoGame(lobbyId, myId()).then(function (res) {
        if (res && res.lobby) { lobbyVersion = -1; applyLobby(res.lobby); }
        if (res && !res.ok && res.error) toast(res.error);
        else toast('Партия отменена');
      }).catch(netError).finally(function () { busy--; });
    });
  }

  function onFinishMatch() {
    if (!lobby || busy) return;
    const n = ((lobby.match && lobby.match.games) || []).length;
    askConfirm(n
      ? 'Завершить встречу? Итоги получат все участники.'
      : 'Партий нет. Закрыть встречу без результата?', function () {
      busy++;
      Api.finishLobby(lobbyId, myId()).then(function (res) {
        if (res && res.lobby) { lobbyVersion = -1; applyLobby(res.lobby); }
        if (res && !res.ok && res.error) notify(res.error);
      }).catch(netError).finally(function () { busy--; });
    });
  }

  function showMatchFinal(l) {
    const r = l.result;
    if (!r) return;
    const tie = r.winnerIdx === null || r.winnerIdx === undefined;
    $('final-title').textContent = tie ? '🤝 Ничья' : '🏅 Итоги встречи';
    const medals = ['🥇', '🥈', '🥉', '4️⃣'];
    $('final-list').innerHTML = r.players.map(p =>
      '<div class="final-item' + (p.place === 1 && !tie ? ' champion' : '') + '">' +
        '<div class="medal">' + (medals[p.place - 1] || '•') + '</div>' +
        '<div class="info"><div class="name">' + esc(p.name) + '</div>' +
        '<div class="title">' + p.winrate + '% побед' + (p.place === 1 && !tie ? ' · 👑 победитель' : '') + '</div></div>' +
        '<div class="prize">' + p.wins + ' : ' + p.losses + '</div></div>'
    ).join('');

    let sum = '';
    if (r.pairs && r.pairs.length && r.players.length > 2) {
      sum += '<div><h4>Личные встречи</h4>' + r.pairs.map(pr =>
        '<div class="debt-card neutral"><span><b>' + esc(pr.aName) + '</b> — <b>' + esc(pr.bName) + '</b></span>' +
        '<span class="debt-cash neutral">' + pr.aw + ' : ' + pr.bw + '</span></div>').join('') + '</div>';
    }
    if (r.bet > 0) {
      let table = '<div><h4>Финансы · ' + plainMoney(r.bet) + ' за партию</h4><div class="sum-table">' +
        '<div class="s-cell head name">Игрок</div><div class="s-cell head">Побед</div><div class="s-cell head">Пораж.</div><div class="s-cell head">Итог</div>';
      r.players.forEach(p => {
        const cls = p.net > 0 ? 'plus' : (p.net < 0 ? 'minus' : '');
        table += '<div class="s-cell name">' + esc(p.name) + '</div><div class="s-cell won">' + p.wins +
          '</div><div class="s-cell lost">' + p.losses + '</div><div class="s-cell total ' + cls + '">' + money(p.net) + '</div>';
      });
      sum += table + '</div></div>';
    }
    sum += '<div><p class="hint" style="margin:10px 0 0;text-align:center">Итоги отправлены всем участникам в Telegram</p></div>';
    $('final-summary-body').innerHTML = sum;
    openOverlay('finalOverlay');
  }

  /* ---------- турнир 4×4 + Double Elimination ---------- */
  function tournamentGames(st) {
    const out = [], n = st.names.length;
    for (let r = 0; r < n; r++) {
      for (let c = r + 1; c < n; c++) {
        const v = st.matrix[r][c];
        if (v === 1) out.push({ a: r, b: c, w: r });
        else if (v === 0) out.push({ a: r, b: c, w: c });
      }
    }
    if (st.format === 'group-de' && st.matches) {
      Object.keys(st.matches).forEach(k => {
        const m = st.matches[k];
        if (m.win !== null && m.p0 !== null && m.p1 !== null) out.push({ a: m.p0, b: m.p1, w: m.win });
      });
    }
    return out;
  }

  function commitTournament() {
    busy++;
    Api.saveLobbyState(lobbyId, myId(), lobbyVersion, state).then(function (res) {
      if (res && res.ok) {
        if (res.version !== undefined && res.version !== null) lobbyVersion = res.version;
        if (lobby) { lobby.tournament = state; lobby.version = lobbyVersion; }
        if (Tournament.isFinished(state)) finishTournament();
      } else if (res && res.lobby) {
        toast(res.error === 'conflict' ? 'Этот ход уже внесён другим игроком' : (res.error || 'Ход не сохранён'));
        haptic('warning');
        lobbyVersion = -1;
        applyLobby(res.lobby);
      } else {
        netError();
      }
    }).catch(netError).finally(function () { busy--; });
  }

  function finishTournament() {
    if (tFinishing || !state || !lobbyId) return;
    tFinishing = true;
    const record = Tournament.buildArchiveRecord(state);
    record.sport = state.sport || (lobby && lobby.sport) || '';
    record.participants = state.players;
    record.games = tournamentGames(state);
    Api.finishLobby(lobbyId, myId(), record).then(function (res) {
      if (res && res.lobby) { lobbyVersion = -1; applyLobby(res.lobby); }
      else if (res && res.error) toast(res.error);
    }).catch(function () {
      toast('Итоги не отправились — повторим');
    }).finally(function () {
      setTimeout(function () { tFinishing = false; }, 4000);
    });
  }

  function canActT() {
    if (canAct(lobby)) return true;
    toast('Вы наблюдаете — ходить могут участники');
    return false;
  }

  function renderTournament() {
    if (!state) return;
    Tournament.recalcBracket(state);
    const bp = Tournament.computeBankAndPrizes(state);
    $('bank-value').textContent = bp.bank.toLocaleString('ru-RU') + ' ₽';
    $('t-title').textContent = sportName(state.sport || (lobby && lobby.sport));

    const scores = Tournament.computeTotalScores(state);
    const rows = state.names.map((name, i) => ({
      name: name, score: scores[i], net: bp.financeByPlayer[i].net,
      tg: state.players[i] && state.players[i].telegramId
    })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    $('leaderboard-body').innerHTML = rows.map((p, idx) => {
      const me = p.tg && String(p.tg) === myId();
      const netSign = p.net > 0 ? '+' : (p.net < 0 ? '−' : '');
      const netTxt = p.net === 0 ? '—' : (netSign + Math.abs(p.net).toLocaleString('ru-RU') + ' ₽');
      return '<tr class="' + (me ? 'is-me' : '') + '"><td class="rank-num">#' + (idx + 1) + '</td>' +
        '<td><b>' + esc(p.name) + '</b>' + (me ? ' · вы' : '') + '</td>' +
        '<td>' + p.score + '</td><td>' + netTxt + '</td></tr>';
    }).join('');

    $('debts-count').textContent = bp.lossList.length + ' ' + Tournament.pluralMatch(bp.lossList.length);
    $('debts-list').innerHTML = bp.lossList.length ? bp.lossList.map(d =>
      '<div class="debt-card"><span><b>' + esc(d.loser) + '</b> → <b>' + esc(d.winner) + '</b></span>' +
      '<span class="debt-cash">' + d.bet.toLocaleString('ru-RU') + ' ₽</span></div>'
    ).join('') : '<div class="debt-card empty">Пока пусто</div>';

    // матрица группы
    const n = 4;
    const root = $('group-matrix');
    root.style.gridTemplateColumns = '1fr repeat(4, 1fr)';
    let html = '<div class="cell head"></div>';
    for (let i = 0; i < n; i++) html += '<div class="cell head">' + esc(Tournament.shortName(state.names[i])) + '</div>';
    for (let r = 0; r < n; r++) {
      html += '<div class="cell head-col">' + esc(Tournament.shortName(state.names[r])) + '</div>';
      for (let c = 0; c < n; c++) {
        if (r === c) { html += '<div class="cell diag">—</div>'; continue; }
        const v = state.matrix[r][c];
        let cls = 'cell', txt = '·';
        if (v === 1) { cls += ' win'; txt = '✓'; }
        else if (v === 0) { cls += ' lose'; txt = '✕'; }
        else cls += ' clickable';
        const can = v === null && state.matrix[c][r] === null;
        html += '<div class="' + cls + '"' + (can ? ' data-r="' + r + '" data-c="' + c + '"' : '') + '>' + txt + '</div>';
      }
    }
    root.innerHTML = html;
    root.querySelectorAll('.cell.clickable').forEach(cell => {
      cell.addEventListener('click', () => {
        if (busy || !canActT()) return;
        if (Tournament.recordGroupWin(state, +cell.dataset.r, +cell.dataset.c, state.currentBet || 1000)) {
          haptic('medium');
          renderTournament();
          commitTournament();
        }
      });
    });

    // сетки плей-офф
    function matchHtml(mKey) {
      const m = state.matches[mKey];
      if (!m) return '';
      const playable = m.p0 !== null && m.p1 !== null && m.win === null;
      const n0 = m.p0 !== null ? state.names[m.p0] : 'Ожидание…';
      const n1 = m.p1 !== null ? state.names[m.p1] : 'Ожидание…';
      const c0 = m.win === m.p0 && m.p0 !== null ? ' is-winner' : (m.win !== null ? ' is-loser' : '');
      const c1 = m.win === m.p1 && m.p1 !== null ? ' is-winner' : (m.win !== null ? ' is-loser' : '');
      return '<div class="match-node' + (playable ? '' : ' disabled') + '">' +
        '<div class="player-row' + c0 + '" data-m="' + mKey + '" data-slot="0"><span class="player-name">' + esc(n0) + '</span></div>' +
        '<div class="player-row' + c1 + '" data-m="' + mKey + '" data-slot="1"><span class="player-name">' + esc(n1) + '</span></div></div>';
    }
    $('bracket-wb').innerHTML = '<div class="bracket-col-label">WB Полуфиналы</div>' + matchHtml('m1') + matchHtml('m2') +
      '<div class="bracket-col-label" style="margin-top:12px">WB Финал</div>' + matchHtml('m4') +
      '<div class="bracket-col-label" style="margin-top:12px">Grand Final</div>' + matchHtml('m6');
    $('bracket-lb').innerHTML = '<div class="bracket-col-label">LB R1</div>' + matchHtml('m3') +
      '<div class="bracket-col-label" style="margin-top:12px">LB Финал</div>' + matchHtml('m5');

    document.querySelectorAll('.player-row[data-m]').forEach(row => {
      row.addEventListener('click', () => {
        if (busy || !canActT()) return;
        if (Tournament.recordPlayoffWin(state, row.dataset.m, +row.dataset.slot, state.currentBet || 1000)) {
          haptic('medium');
          renderTournament();
          commitTournament();
        }
      });
    });
  }

  function showTournamentFinal(st) {
    if (!st) return;
    Tournament.recalcBracket(st);
    const bp = Tournament.computeBankAndPrizes(st);
    const medals = ['🥇', '🥈', '🥉', '4️⃣'];
    $('final-title').textContent = '🏆 Турнир завершён';
    let list = '';
    for (let i = 0; i < 4; i++) {
      const pIdx = st.podium[i];
      if (pIdx === null || pIdx === undefined) continue;
      const title = i === 0 ? '👑 Повелитель кия' : (st.assignedTitles[pIdx] || 'Мастер сукна');
      const amount = bp.prizes[i] || 0;
      list += '<div class="final-item' + (i === 0 ? ' champion' : '') + '"><div class="medal">' + medals[i] + '</div>' +
        '<div class="info"><div class="name">' + esc(st.names[pIdx]) + '</div><div class="title">' + esc(title) + '</div></div>' +
        '<div class="prize">' + (amount > 0 ? amount.toLocaleString('ru-RU') + ' ₽' : '—') + '</div></div>';
    }
    $('final-list').innerHTML = list;

    let table = '<div><h4>Финансы</h4><div class="sum-table"><div class="s-cell head name">Игрок</div><div class="s-cell head">Внёс</div>' +
      '<div class="s-cell head">Выиграл</div><div class="s-cell head">Итог</div>';
    for (let k = 0; k < 4; k++) {
      const idx = st.podium[k];
      if (idx === null || idx === undefined) continue;
      const f = bp.financeByPlayer[idx];
      const cls = f.net > 0 ? 'plus' : (f.net < 0 ? 'minus' : '');
      const sign = f.net > 0 ? '+' : (f.net < 0 ? '−' : '');
      table += '<div class="s-cell name">' + esc(st.names[idx]) + '</div>' +
        '<div class="s-cell lost">−' + f.lost.toLocaleString('ru-RU') + ' ₽</div>' +
        '<div class="s-cell won">+' + f.won.toLocaleString('ru-RU') + ' ₽</div>' +
        '<div class="s-cell total ' + cls + '">' + sign + Math.abs(f.net).toLocaleString('ru-RU') + ' ₽</div>';
    }
    table += '</div></div><div><p class="hint" style="margin:10px 0 0;text-align:center">Итоги отправлены всем участникам в Telegram</p></div>';
    $('final-summary-body').innerHTML = table;
    openOverlay('finalOverlay');
  }

  /* ---------- статистика ---------- */
  function openStats() {
    $('stats-body').innerHTML = '<div class="empty-stats">Загрузка…</div>';
    showScreen('stats');
    if (!Api.enabled()) {
      $('stats-body').innerHTML = '<div class="empty-stats">Облако не настроено (config.js) — статистика недоступна</div>';
      return;
    }
    loadPlayersCache();
    Api.getStats().then(function (d) {
      statsData = d;
      renderStats(d);
    }).catch(function () {
      $('stats-body').innerHTML = '<div class="empty-stats">Не удалось загрузить статистику.<br>Проверьте связь и попробуйте ещё раз.</div>';
    });
  }

  function renderStats(data) {
    const body = $('stats-body');
    const me = myId();
    const list = ((data && data.players) || [])
      .filter(p => p.games > 0 || p.tournaments > 0 || String(p.telegramId) === me)
      .sort((a, b) => (String(b.telegramId) === me ? 1 : 0) - (String(a.telegramId) === me ? 1 : 0));
    if (!list.length) {
      body.innerHTML = '<div class="empty-stats">Пока нет статистики.<br>Сыграйте первую встречу — здесь появятся винрейт и личные счёты с каждым соперником.</div>';
      return;
    }
    body.innerHTML = list.map((p, i) => {
      const mine = String(p.telegramId) === me;
      const net = Number(p.net) || 0;
      const vs = p.vs || [];
      return '<div class="stat-card' + (mine ? ' is-me' : '') + '">' +
        '<div class="stat-top">' + avatarHtml({ id: p.telegramId, name: p.name }) +
          '<div class="stat-name">' + esc(p.name) + (mine ? '<small>это вы</small>' : '') + '</div>' +
          '<div class="wr-ring" style="--p:' + p.winrate + '"><b>' + p.winrate + '%</b></div></div>' +
        '<div class="stat-grid">' +
          '<div class="stat-item"><div class="val">' + p.wins + '/' + p.games + '</div><div class="lbl">Победы</div></div>' +
          '<div class="stat-item"><div class="val">' + (p.tournaments || 0) + '</div><div class="lbl">Встреч</div></div>' +
          '<div class="stat-item"><div class="val">🥇' + (p.gold || 0) + '</div><div class="lbl">Турниры</div></div>' +
          '<div class="stat-item"><div class="val ' + (net > 0 ? 'plus' : (net < 0 ? 'minus' : '')) + '">' + (net ? money(net) : '0 ₽') + '</div><div class="lbl">Баланс</div></div>' +
        '</div>' +
        (vs.length
          ? '<button type="button" class="text-btn vs-toggle" data-i="' + i + '">' + (mine ? 'Скрыть' : 'Против соперников') + ' · ' + vs.length + '</button>' +
            '<div class="vs-list' + (mine ? ' open' : '') + '" id="vs-' + i + '"><div class="vs-title">Винрейт против каждого соперника</div>' +
            vs.map(v =>
              '<div class="vs-row"><span class="vs-name">' + esc(v.name) + '</span>' +
              '<span class="vs-score">' + v.wins + ' : ' + v.losses + '</span><span class="vs-rate">' + v.winrate + '%</span>' +
              '<div class="vs-bar"><i style="width:' + v.winrate + '%"></i></div></div>').join('') + '</div>'
          : '') +
        '</div>';
    }).join('');
    body.querySelectorAll('.vs-toggle').forEach(btn => btn.addEventListener('click', () => {
      const box = $('vs-' + btn.dataset.i);
      const open = box.classList.toggle('open');
      btn.textContent = (open ? 'Скрыть' : 'Против соперников') + ' · ' + box.querySelectorAll('.vs-row').length;
    }));
  }

  /* ---------- меню и кнопки ---------- */
  function bindStatic() {
    document.querySelectorAll('#format-chips .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        selectedFormat = chip.dataset.format;
        document.querySelectorAll('#format-chips .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        $('setup-bet').value = selectedFormat === 'free' ? 500 : 1000;
        updateSetupForm();
      });
    });
    document.querySelectorAll('.quick-bets button').forEach(btn => {
      btn.addEventListener('click', () => { $('setup-bet').value = btn.dataset.bet; });
    });
    $('btn-start').addEventListener('click', onStart);
    $('btn-setup-back').addEventListener('click', onSetupBack);
    $('btn-match-back').addEventListener('click', () => showScreen('home'));
    $('resume-card').addEventListener('click', () => { if (lobby) showLobbyScreen(); });
    $('btn-open-stats').addEventListener('click', openStats);

    $('debtsToggle').addEventListener('click', () => {
      const exp = $('debtsBody').classList.toggle('expanded');
      $('debtsToggle').textContent = exp ? 'Свернуть' : 'Развернуть';
    });
    $('btn-menu-t').addEventListener('click', () => {
      $('menu-cancel').hidden = !(lobby && String(lobby.hostId) === myId());
      openOverlay('menuOverlay');
    });
    $('menu-close').addEventListener('click', () => closeOverlay('menuOverlay'));
    $('menu-stats').addEventListener('click', () => { closeOverlay('menuOverlay'); openStats(); });
    $('menu-home').addEventListener('click', () => { closeOverlay('menuOverlay'); showScreen('home'); });
    $('menu-cancel').addEventListener('click', () => {
      closeOverlay('menuOverlay');
      askConfirm('Отменить встречу для всех участников?', function () {
        if (!lobbyId) return;
        Api.cancelLobby(lobbyId, myId()).then(function (res) {
          if (res && res.ok) handleCancelled();
          else notify((res && res.error) || 'Не удалось отменить');
        }).catch(function () { toast('Нет связи'); });
      });
    });
    $('btn-close-final').addEventListener('click', () => {
      closeOverlay('finalOverlay');
      leaveLobby();
      showScreen('home');
    });
    $('btn-new-from-final').addEventListener('click', () => {
      closeOverlay('finalOverlay');
      leaveLobby();
      openSetup();
    });
    document.querySelectorAll('[data-back]').forEach(btn => {
      btn.addEventListener('click', () => showScreen('home'));
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pollTick(); });
  }

  /* ---------- запуск ---------- */
  function boot() {
    buildIntro();
    runIntro();
    initTelegram();
    renderHome();
    bindStatic();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
    if (!Api.enabled()) return;

    const wanted = getLobbyParam();
    if (wanted) {
      // приглашённый: сразу в матч, минуя меню
      openLobbyById(wanted);
    } else if (tgUser && isTgId(tgUser.id)) {
      // вернуться в идущую встречу (своя или чужая)
      Api.getMyActive(tgUser.id).then(function (res) {
        if (!res || !res.lobby || userNavigated) return;
        if (String(res.lobby.hostId) === myId()) enterLobby(res.lobby);
        else openLobbyById(res.lobby.id);
      }).catch(function () {});
    }
  }

  boot();
})();
