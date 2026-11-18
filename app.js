(function () {
  'use strict';

  let state = null;
  let h2h = null;
  let finalOpened = false;
  let selectedSport = 'american';
  let selectedFormat = 'h2h';
  let tgUser = null;

  const SPORTS = [
    { id: 'american', name: 'Американский пул', icon: '🎱', desc: 'Пул 8 / 9 / 10' },
    { id: 'russian', name: 'Русский бильярд', icon: '🟢', desc: 'Пирамида' }
  ];

  function $(id) { return document.getElementById(id); }
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = $('screen-' + id);
    if (el) el.classList.add('active');
  }
  function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg || 'Сохранено';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1600);
  }
  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function openOverlay(id) { $(id).classList.add('active'); }
  function closeOverlay(id) { $(id).classList.remove('active'); }

  // ---------- Telegram ----------
  function initTelegram() {
    if (window.Telegram && Telegram.WebApp) {
      try {
        Telegram.WebApp.ready();
        Telegram.WebApp.expand();
      } catch (e) {}
      const u = Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
      if (u && u.id) {
        tgUser = {
          id: String(u.id),
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || ('ID ' + u.id),
          username: u.username || null
        };
        Storage.setMe(tgUser);
        Storage.upsertPlayer(tgUser.name, tgUser.id);
        if (Api.enabled()) {
          Api.ensureMe({ telegramId: tgUser.id, name: tgUser.name, username: tgUser.username || '' })
            .then(function (r) {
              if (r && r.photoUrl) tgUser.photoUrl = r.photoUrl;
            })
            .catch(function () {
              Api.upsertPlayer({ telegramId: tgUser.id, name: tgUser.name, username: tgUser.username || '' }).catch(function () {});
            });
        }
      }
    } else {
      tgUser = Storage.getMe();
    }
    updateBadges();
  }

  function updateBadges() {
    const me = $('me-badge');
    if (me) {
      if (tgUser && tgUser.id) {
        me.textContent = 'Вы: ' + tgUser.name + ' · ID ' + tgUser.id;
      } else {
        me.textContent = 'Откройте через Telegram-бота, чтобы привязать ID';
      }
    }
    const api = $('api-badge');
    if (api) {
      if (!Api.enabled()) {
        api.textContent = 'Облако: не настроено (config.js)';
        api.className = 'api-badge warn';
      } else {
        Api.ping().then(function () {
          api.textContent = 'Облако: онлайн';
          api.className = 'api-badge ok';
        }).catch(function () {
          api.textContent = 'Облако: ошибка связи с таблицей';
          api.className = 'api-badge warn';
        });
      }
    }
  }

  // ---------- Home ----------
  function renderHome() {
    const grid = $('sport-grid');
    grid.innerHTML = SPORTS.map(s => `
      <div class="sport-card active-sport" data-sport="${s.id}">
        <div class="sport-icon">${s.icon}</div>
        <h3>${s.name}</h3>
        <p>${s.desc}</p>
      </div>
    `).join('');
    grid.querySelectorAll('.sport-card').forEach(card => {
      card.addEventListener('click', () => {
        selectedSport = card.dataset.sport;
        openSetup();
      });
    });
  }

  // ---------- Setup ----------
  function openSetup() {
    const sport = SPORTS.find(s => s.id === selectedSport);
    $('setup-title').textContent = sport ? sport.name : 'Встреча';
    selectedFormat = 'h2h';
    document.querySelectorAll('#format-chips .chip').forEach(c => {
      c.classList.toggle('active', c.dataset.format === 'h2h');
    });
    updateSetupForm();
    showScreen('setup');
  }

  function updateSetupForm() {
    const isH2H = selectedFormat === 'h2h';
    $('bet-block').style.display = '';
    const betLabel = $('bet-block').querySelector('label');
    if (betLabel) betLabel.textContent = isH2H ? 'Ставка за проигранную партию (0 = без денег)' : 'Ставка за проигрыш';
    $('players-label').textContent = isH2H ? 'Соперник' : 'Участники';

    const hostName = (tgUser && tgUser.name) || 'Вы';
    const hostId = (tgUser && tgUser.id) || '';
    const box = $('player-inputs');
    box.innerHTML = `
      <div class="player-slot-block host-slot">
        <div class="player-slot">
          <span class="slot-num">1</span>
          <input type="text" class="p-name" id="host-name" value="${escapeHtml(hostName)}" maxlength="24" readonly>
        </div>
        <div class="hint">Вы (инициатор)${hostId ? ' · ID ' + hostId : ' · откройте через бота'}</div>
      </div>
      <div class="field-block">
        <label>${isH2H ? 'Кто уже в боте — выбери соперника' : 'Выбери участников (кто уже нажал Start)'}</label>
        <div id="roster-grid" class="roster-grid"><div class="hint">Загрузка…</div></div>
        <div id="picked-list" class="picked-list"></div>
        <p class="hint">В списке только те, кто хотя бы раз нажал Start у бота. Нажми на карточку, чтобы отправить приглашение.</p>
      </div>
      <div class="field-block">
        <label>Или имя вручную (без приглашения)</label>
        <div id="manual-players"></div>
      </div>`;

    const manual = box.querySelector('#manual-players');
    const needExtra = isH2H ? 1 : 3;
    for (let i = 0; i < needExtra; i++) {
      const div = document.createElement('div');
      div.className = 'player-slot';
      div.style.marginBottom = '6px';
      div.innerHTML = `<span class="slot-num">${i + 2}</span>
        <input type="text" class="p-name-extra" placeholder="Имя игрока ${i + 2}" maxlength="24">`;
      manual.appendChild(div);
    }

    window._pickedInvites = [];
    loadRoster();
  }

  let currentLobbyId = null;

  function loadRoster() {
    const grid = $('roster-grid');
    if (!grid) return;
    if (!Api.enabled()) {
      grid.innerHTML = '<div class="hint">Облако не настроено — список из бота недоступен</div>';
      return;
    }
    Api.getPlayers().then(function (players) {
      const meId = tgUser && tgUser.id ? String(tgUser.id) : '';
      const list = (players || []).filter(p => p.telegramId && String(p.telegramId) !== meId);
      if (!list.length) {
        grid.innerHTML = '<div class="hint">Пока никто не нажал Start у бота. Пусть друзья откроют бота один раз.</div>';
        return;
      }
      grid.innerHTML = list.map(p => {
        const photo = p.photoUrl
          ? `<img class="roster-avatar" src="${escapeHtml(p.photoUrl)}" alt="">`
          : `<div class="roster-avatar placeholder">${escapeHtml((p.name || '?').slice(0, 1))}</div>`;
        return `<button type="button" class="roster-card" data-id="${escapeHtml(p.telegramId)}" data-name="${escapeHtml(p.name || '')}">
          ${photo}
          <span class="roster-name">${escapeHtml(p.name || 'Игрок')}</span>
        </button>`;
      }).join('');
      grid.querySelectorAll('.roster-card').forEach(card => {
        card.addEventListener('click', () => onPickPlayer(card.dataset.id, card.dataset.name));
      });
    }).catch(function () {
      grid.innerHTML = '<div class="hint">Не удалось загрузить список игроков</div>';
    });
  }

  function renderPicked() {
    const el = $('picked-list');
    if (!el) return;
    const arr = window._pickedInvites || [];
    if (!arr.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="hint">Приглашены:</div>' + arr.map(p =>
      `<span class="picked-chip">${escapeHtml(p.name)}</span>`
    ).join(' ');
  }

  function onPickPlayer(toId, toName) {
    if (!tgUser || !tgUser.id) {
      alert('Откройте приложение через бота');
      return;
    }
    if (!Api.enabled()) {
      alert('Нужен API таблицы');
      return;
    }
    const isH2H = selectedFormat === 'h2h';
    const already = (window._pickedInvites || []).some(p => String(p.id) === String(toId));
    if (already) {
      alert('Уже в списке');
      return;
    }
    if (isH2H && (window._pickedInvites || []).length >= 1) {
      alert('Для 1 на 1 нужен один соперник');
      return;
    }
    if (!isH2H && (window._pickedInvites || []).length >= 3) {
      alert('В турнире максимум 3 приглашённых (+ вы)');
      return;
    }
    if (!confirm('Отправить приглашение игроку «' + toName + '»?')) return;

    const bet = Math.max(0, parseInt($('setup-bet').value, 10) || 0);
    const ensureLobby = currentLobbyId
      ? Api.getLobby(currentLobbyId).then(function (l) { return l || null; })
      : Promise.resolve(null);

    ensureLobby.then(function (lobby) {
      if (lobby) return { ok: true, lobby: lobby };
      return Api.createLobby({
        hostId: tgUser.id,
        hostName: tgUser.name,
        sport: selectedSport,
        format: selectedFormat,
        bet: bet
      });
    }).then(function (res) {
      if (!res || !res.lobby) throw new Error((res && res.error) || 'lobby');
      currentLobbyId = res.lobby.id;
      return Api.inviteById(currentLobbyId, toId, toName);
    }).then(function (res) {
      if (!res.ok) {
        alert('Не удалось отправить: ' + (res.error || 'ошибка') +
          '\nИгрок должен хотя бы раз нажать Start у бота.');
        return;
      }
      window._pickedInvites = window._pickedInvites || [];
      window._pickedInvites.push({ id: toId, name: toName });
      renderPicked();
      // подставить имя в ручное поле если пусто
      const extras = document.querySelectorAll('.p-name-extra');
      for (let i = 0; i < extras.length; i++) {
        if (!extras[i].value.trim()) { extras[i].value = toName; break; }
      }
      toast('Приглашение отправлено');
    }).catch(function (e) {
      alert('Ошибка: ' + (e.message || e));
    });
  }

  function getSetupPlayers() {
    const out = [];
    const hostName = (($('host-name') && $('host-name').value) || (tgUser && tgUser.name) || '').trim();
    if (hostName) {
      out.push({ name: hostName, telegramId: (tgUser && tgUser.id) || null });
    }
    document.querySelectorAll('.p-name-extra').forEach(function (inp) {
      const name = inp.value.trim();
      if (name) out.push({ name: name, telegramId: null });
    });
    return out;
  }

  document.querySelectorAll('#format-chips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectedFormat = chip.dataset.format;
      document.querySelectorAll('#format-chips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      updateSetupForm();
    });
  });
  document.querySelectorAll('.quick-bets button').forEach(btn => {
    btn.addEventListener('click', () => { $('setup-bet').value = btn.dataset.bet; });
  });

  $('btn-start').addEventListener('click', () => {
    const players = getSetupPlayers();
    const need = selectedFormat === 'h2h' ? 2 : 4;
    if (players.length !== need) {
      alert(need === 2 ? 'Нужно 2 игрока' : 'Для турнира нужно ровно 4 игрока');
      return;
    }
    const names = new Set(players.map(p => p.name.toLowerCase()));
    if (names.size !== players.length) { alert('Имена должны быть разными'); return; }

    players.forEach(p => {
      Storage.upsertPlayer(p.name, p.telegramId);
      if (Api.enabled() && p.telegramId) {
        Api.upsertPlayer({ telegramId: p.telegramId, name: p.name }).catch(function () {});
      }
    });

    const bet = Math.max(0, parseInt($('setup-bet').value, 10) || 0);
    if (selectedFormat === 'h2h') {
      startH2H(players, bet);
    } else {
      state = Tournament.createEmptyState(players, bet, 'group-de');
      Tournament.recalcBracket(state);
      state.sport = selectedSport;
      Storage.setCurrent({ type: 'tournament', state: state });
      cloudSave();
      finalOpened = false;
      renderTournament();
      showScreen('tournament');
    }
  });

  // ---------- H2H ----------
  function startH2H(players, bet) {
    h2h = {
      type: 'h2h',
      sport: selectedSport,
      p1: players[0],
      p2: players[1],
      bet: bet || 0,
      games: [],
      pending: true,
      score: [0, 0]
    };
    Storage.setCurrent(h2h);
    cloudSave();
    renderH2H();
    showScreen('h2h');
  }

  function renderH2H() {
    if (!h2h) return;
    const sport = SPORTS.find(s => s.id === h2h.sport);
    $('h2h-title').textContent = (sport ? sport.name : '1 на 1');
    $('h2h-sub').textContent = h2h.p1.name + ' vs ' + h2h.p2.name +
      (h2h.bet ? (' · ' + h2h.bet + ' ₽/партия') : ' · без ставки');
    $('h2h-score').textContent = h2h.score[0] + ' : ' + h2h.score[1];

    const list = $('h2h-games');
    list.innerHTML = h2h.games.map((g, i) => {
      const w = g.winner === 0 ? h2h.p1.name : h2h.p2.name;
      return `<div class="h2h-game done">Партия ${i + 1}: победил <b>${escapeHtml(w)}</b></div>`;
    }).join('');

    const cur = $('h2h-current');
    const actions = $('h2h-actions');
    if (h2h.pending) {
      const num = h2h.games.length + 1;
      cur.innerHTML = `
        <div class="h2h-vs">Партия ${num}</div>
        <div class="h2h-pick">
          <button type="button" class="h2h-player-btn" data-w="0">${escapeHtml(h2h.p1.name)}</button>
          <span class="h2h-vs-label">VS</span>
          <button type="button" class="h2h-player-btn" data-w="1">${escapeHtml(h2h.p2.name)}</button>
        </div>
        <p class="hint">Нажми на победителя</p>`;
      actions.style.display = 'none';
      cur.querySelectorAll('.h2h-player-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const w = +btn.dataset.w;
          h2h.games.push({ winner: w, at: new Date().toISOString() });
          h2h.score[w]++;
          h2h.pending = false;
          Storage.setCurrent(h2h);
          cloudSave();
          renderH2H();
        });
      });
    } else {
      cur.innerHTML = '<p class="hint">Партия сыграна</p>';
      actions.style.display = 'flex';
    }
  }

  $('btn-h2h-next').addEventListener('click', () => {
    if (!h2h) return;
    h2h.pending = true;
    Storage.setCurrent(h2h);
    renderH2H();
  });

  $('btn-h2h-end').addEventListener('click', () => {
    if (!h2h || !h2h.games.length) {
      if (!confirm('Нет сыгранных партий. Выйти?')) return;
      Storage.clearCurrent();
      h2h = null;
      showScreen('home');
      return;
    }
    finishH2H();
  });

  $('btn-h2h-back').addEventListener('click', () => {
    if (confirm('Выйти из встречи? Прогресс сохранится локально до завершения.')) {
      showScreen('home');
    }
  });

  function finishH2H() {
    const s1 = h2h.score[0], s2 = h2h.score[1];
    let winnerIdx = s1 === s2 ? -1 : (s1 > s2 ? 0 : 1);
    const winner = winnerIdx < 0 ? null : (winnerIdx === 0 ? h2h.p1 : h2h.p2);

    // local stats
    const id1 = h2h.p1.telegramId || h2h.p1.name;
    const id2 = h2h.p2.telegramId || h2h.p2.name;
    const k1 = Storage.playerKey(h2h.p1.name, h2h.p1.telegramId);
    const k2 = Storage.playerKey(h2h.p2.name, h2h.p2.telegramId);
    Storage.upsertPlayer(h2h.p1.name, h2h.p1.telegramId);
    Storage.upsertPlayer(h2h.p2.name, h2h.p2.telegramId);

    const p1 = Storage.getPlayerByKey(k1) || {};
    const p2 = Storage.getPlayerByKey(k2) || {};

    // series win counts as one "meeting" win for overall h2h
    if (winnerIdx === 0) {
      Storage.updatePlayerStats(k1, { h2hWins: (p1.h2hWins || 0) + 1, totalWins: (p1.totalWins || 0) + s1, totalLosses: (p1.totalLosses || 0) + s2, tournaments: (p1.tournaments || 0) + 1 });
      Storage.updatePlayerStats(k2, { h2hLosses: (p2.h2hLosses || 0) + 1, totalWins: (p2.totalWins || 0) + s2, totalLosses: (p2.totalLosses || 0) + s1, tournaments: (p2.tournaments || 0) + 1 });
    } else if (winnerIdx === 1) {
      Storage.updatePlayerStats(k2, { h2hWins: (p2.h2hWins || 0) + 1, totalWins: (p2.totalWins || 0) + s2, totalLosses: (p2.totalLosses || 0) + s1, tournaments: (p2.tournaments || 0) + 1 });
      Storage.updatePlayerStats(k1, { h2hLosses: (p1.h2hLosses || 0) + 1, totalWins: (p1.totalWins || 0) + s1, totalLosses: (p1.totalLosses || 0) + s2, tournaments: (p1.tournaments || 0) + 1 });
    } else {
      Storage.updatePlayerStats(k1, { totalWins: (p1.totalWins || 0) + s1, totalLosses: (p1.totalLosses || 0) + s2, tournaments: (p1.tournaments || 0) + 1 });
      Storage.updatePlayerStats(k2, { totalWins: (p2.totalWins || 0) + s2, totalLosses: (p2.totalLosses || 0) + s1, tournaments: (p2.tournaments || 0) + 1 });
    }

    const rec = {
      sport: h2h.sport,
      bet: h2h.bet || 0,
      p1Id: h2h.p1.telegramId || '',
      p1Name: h2h.p1.name,
      p2Id: h2h.p2.telegramId || '',
      p2Name: h2h.p2.name,
      winnerId: winner ? (winner.telegramId || '') : '',
      winnerName: winner ? winner.name : 'Ничья',
      score: h2h.score.slice(),
      games: h2h.games.slice(),
      date: new Date().toISOString()
    };
    Storage.addH2H(rec);

    if (Api.enabled()) {
      Api.recordH2H(rec).then(function () { toast('Сохранено в таблицу'); })
        .catch(function (e) { console.warn(e); toast('Локально ок, таблица: ошибка'); });
      Api.clearState().catch(function () {});
    }

    Storage.clearCurrent();
    alert(
      'Встреча завершена\n' +
      h2h.p1.name + ' ' + s1 + ' : ' + s2 + ' ' + h2h.p2.name +
      (winner ? ('\nПобедитель: ' + winner.name) : '\nНичья')
    );
    h2h = null;
    showScreen('home');
  }

  // ---------- Tournament (4 players DE) ----------
  function cloudSave() {
    if (!Api.enabled()) return;
    const payload = h2h || (state ? { type: 'tournament', state: state } : null);
    if (!payload) return;
    Api.saveState(payload).then(function () {
      toast('Синхронизировано');
    }).catch(function (e) {
      console.warn('cloud', e);
    });
  }

  function renderTournament() {
    if (!state) return;
    Tournament.recalcBracket(state);
    const bp = Tournament.computeBankAndPrizes(state);
    $('bank-value').textContent = bp.bank.toLocaleString('ru-RU') + ' ₽';
    const sport = SPORTS.find(s => s.id === state.sport);
    if (sport) $('t-title').textContent = sport.name;

    const scores = Tournament.computeTotalScores(state);
    const rows = state.names.map((name, i) => ({
      name, score: scores[i], net: bp.financeByPlayer[i].net,
      tg: state.players[i] && state.players[i].telegramId
    })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    $('leaderboard-body').innerHTML = rows.map((p, idx) => {
      const me = tgUser && p.tg && String(p.tg) === String(tgUser.id);
      const netSign = p.net > 0 ? '+' : (p.net < 0 ? '−' : '');
      const netTxt = p.net === 0 ? '—' : (netSign + Math.abs(p.net).toLocaleString('ru-RU') + ' ₽');
      return `<tr class="${me ? 'is-me' : ''}"><td class="rank-num">#${idx + 1}</td>
        <td><b>${escapeHtml(p.name)}</b>${me ? ' · вы' : ''}${p.tg ? '<div class="tg-id">' + p.tg + '</div>' : ''}</td>
        <td>${p.score}</td><td>${netTxt}</td></tr>`;
    }).join('');

    $('debts-count').textContent = bp.lossList.length + ' ' + Tournament.pluralMatch(bp.lossList.length);
    const dl = $('debts-list');
    dl.innerHTML = bp.lossList.length ? bp.lossList.map(d =>
      `<div class="debt-card"><span><b>${escapeHtml(d.loser)}</b> → <b>${escapeHtml(d.winner)}</b></span>
       <span class="debt-cash">${d.bet.toLocaleString('ru-RU')} ₽</span></div>`
    ).join('') : '<div class="debt-card empty">Пока пусто</div>';

    // matrix
    const n = 4;
    const root = $('group-matrix');
    root.style.gridTemplateColumns = '1fr repeat(4, 1fr)';
    let html = '<div class="cell head"></div>';
    for (let i = 0; i < n; i++) html += `<div class="cell head">${Tournament.shortName(state.names[i])}</div>`;
    for (let r = 0; r < n; r++) {
      html += `<div class="cell head-col">${Tournament.shortName(state.names[r])}</div>`;
      for (let c = 0; c < n; c++) {
        if (r === c) html += '<div class="cell diag">—</div>';
        else {
          const v = state.matrix[r][c];
          let cls = 'cell', txt = '·';
          if (v === 1) { cls += ' win'; txt = '✓'; }
          else if (v === 0) { cls += ' lose'; txt = '✕'; }
          else cls += ' clickable';
          const can = v === null && state.matrix[c][r] === null;
          html += `<div class="${cls}"${can ? ` data-r="${r}" data-c="${c}"` : ''}>${txt}</div>`;
        }
      }
    }
    root.innerHTML = html;
    root.querySelectorAll('.cell.clickable').forEach(cell => {
      cell.addEventListener('click', () => {
        if (Tournament.recordGroupWin(state, +cell.dataset.r, +cell.dataset.c, state.currentBet || 1000)) {
          Storage.setCurrent({ type: 'tournament', state: state });
          cloudSave();
          renderTournament();
          checkFinished();
        }
      });
    });

    // brackets
    function matchHtml(mKey) {
      const m = state.matches[mKey];
      if (!m) return '';
      const playable = m.p0 !== null && m.p1 !== null && m.win === null;
      const n0 = m.p0 !== null ? state.names[m.p0] : 'Ожидание…';
      const n1 = m.p1 !== null ? state.names[m.p1] : 'Ожидание…';
      const c0 = m.win === m.p0 && m.p0 !== null ? ' is-winner' : (m.win !== null ? ' is-loser' : '');
      const c1 = m.win === m.p1 && m.p1 !== null ? ' is-winner' : (m.win !== null ? ' is-loser' : '');
      return `<div class="match-node${playable ? '' : ' disabled'}">
        <div class="player-row${c0}" data-m="${mKey}" data-slot="0"><span class="player-name">${escapeHtml(n0)}</span></div>
        <div class="player-row${c1}" data-m="${mKey}" data-slot="1"><span class="player-name">${escapeHtml(n1)}</span></div>
      </div>`;
    }
    $('bracket-wb').innerHTML = `<div class="bracket-col-label">WB Полуфиналы</div>${matchHtml('m1')}${matchHtml('m2')}
      <div class="bracket-col-label" style="margin-top:12px">WB Финал</div>${matchHtml('m4')}
      <div class="bracket-col-label" style="margin-top:12px">Grand Final</div>${matchHtml('m6')}`;
    $('bracket-lb').innerHTML = `<div class="bracket-col-label">LB R1</div>${matchHtml('m3')}
      <div class="bracket-col-label" style="margin-top:12px">LB Финал</div>${matchHtml('m5')}`;

    document.querySelectorAll('.player-row[data-m]').forEach(row => {
      row.addEventListener('click', () => {
        if (Tournament.recordPlayoffWin(state, row.dataset.m, +row.dataset.slot, state.currentBet || 1000)) {
          Storage.setCurrent({ type: 'tournament', state: state });
          cloudSave();
          renderTournament();
          checkFinished();
        }
      });
    });
  }

  function checkFinished() {
    if (!Tournament.isFinished(state) || finalOpened) return;
    setTimeout(() => {
      finalOpened = true;
      const bp = Tournament.computeBankAndPrizes(state);
      const medals = ['🥇', '🥈', '🥉', '4️⃣'];
      const list = $('final-list');
      list.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        const pIdx = state.podium[i];
        if (pIdx === null || pIdx === undefined) continue;
        const title = i === 0 ? '👑 Повелитель кия' : (state.assignedTitles[pIdx] || 'Мастер сукна');
        const amount = bp.prizes[i] || 0;
        list.innerHTML += `<div class="final-item${i === 0 ? ' champion' : ''}">
          <div class="medal">${medals[i]}</div>
          <div class="info"><div class="name">${escapeHtml(state.names[pIdx])}</div>
          <div class="title">${escapeHtml(title)}</div></div>
          <div class="prize">${amount > 0 ? amount.toLocaleString('ru-RU') + ' ₽' : '—'}</div></div>`;
      }
      let table = '<div class="sum-table"><div class="s-cell head name">Игрок</div><div class="s-cell head">Внёс</div><div class="s-cell head">Выиграл</div><div class="s-cell head">Итог</div>';
      for (let k = 0; k < 4; k++) {
        const idx = state.podium[k];
        if (idx === null || idx === undefined) continue;
        const f = bp.financeByPlayer[idx];
        const netCls = f.net > 0 ? 'plus' : (f.net < 0 ? 'minus' : '');
        const netSign = f.net > 0 ? '+' : (f.net < 0 ? '−' : '');
        table += `<div class="s-cell name">${escapeHtml(state.names[idx])}</div>
          <div class="s-cell lost">−${f.lost.toLocaleString('ru-RU')} ₽</div>
          <div class="s-cell won">+${f.won.toLocaleString('ru-RU')} ₽</div>
          <div class="s-cell total ${netCls}">${netSign}${Math.abs(f.net).toLocaleString('ru-RU')} ₽</div>`;
      }
      table += '</div>';
      $('final-summary-body').innerHTML = table;
      openOverlay('finalOverlay');

      const record = Tournament.buildArchiveRecord(state);
      record.sport = state.sport;
      Storage.addTournament(record);
      Tournament.applyToPlayerStats(record);
      Storage.clearCurrent();
      if (Api.enabled()) {
        Api.archiveTournament(record).catch(function (e) { console.warn(e); });
      }
    }, 300);
  }

  // ---------- Stats ----------
  function renderStats() {
    const players = Storage.getPlayerList();
    const body = $('stats-body');
    if (!players.length) {
      body.innerHTML = '<div class="empty-stats">Пока нет статистики</div>';
      return;
    }
    body.innerHTML = players.map(p => {
      const games = (p.totalWins || 0) + (p.totalLosses || 0);
      const wr = games > 0 ? Math.round((p.totalWins / games) * 100) : 0;
      const h2hG = (p.h2hWins || 0) + (p.h2hLosses || 0);
      const h2hWr = h2hG > 0 ? Math.round((p.h2hWins / h2hG) * 100) : 0;
      const me = tgUser && p.telegramId && String(p.telegramId) === String(tgUser.id);
      return `<div class="stat-card${me ? ' is-me' : ''}">
        <div class="name">${escapeHtml(p.name)}${me ? ' · вы' : ''}</div>
        ${p.telegramId ? '<div class="tg-id">ID ' + p.telegramId + '</div>' : ''}
        <div class="stat-grid">
          <div class="stat-item"><div class="val">${wr}%</div><div class="lbl">Винрейт</div></div>
          <div class="stat-item"><div class="val">${p.totalWins || 0}/${games}</div><div class="lbl">Победы</div></div>
          <div class="stat-item"><div class="val">${h2hWr}%</div><div class="lbl">1×1 винрейт</div></div>
          <div class="stat-item"><div class="val">${p.gold || 0}</div><div class="lbl">🥇</div></div>
          <div class="stat-item"><div class="val">${p.h2hWins || 0}</div><div class="lbl">Побед 1×1</div></div>
          <div class="stat-item"><div class="val">${p.tournaments || 0}</div><div class="lbl">Встреч</div></div>
        </div>
      </div>`;
    }).join('');

    // show H2H pairs involving me
    if (tgUser && tgUser.id) {
      const hlist = Storage.getH2H().filter(m =>
        String(m.p1Id) === String(tgUser.id) || String(m.p2Id) === String(tgUser.id) ||
        m.p1Name === tgUser.name || m.p2Name === tgUser.name
      ).slice(0, 15);
      if (hlist.length) {
        body.innerHTML += '<div class="section-label" style="margin-top:16px">Ваши личные встречи</div>';
        body.innerHTML += hlist.map(m => {
          const sc = (m.score && m.score.join) ? m.score.join(' : ') : '';
          return `<div class="debt-card"><span>${escapeHtml(m.p1Name)} vs ${escapeHtml(m.p2Name)}
            ${sc ? ' (' + sc + ')' : ''}</span>
            <span class="debt-cash">${escapeHtml(m.winnerName || '')}</span></div>`;
        }).join('');
      }
    }
  }

  // menus
  $('debtsToggle').addEventListener('click', () => {
    const exp = $('debtsBody').classList.toggle('expanded');
    $('debtsToggle').textContent = exp ? 'Свернуть' : 'Развернуть';
  });
  $('btn-menu-t').addEventListener('click', () => openOverlay('menuOverlay'));
  $('menu-close').addEventListener('click', () => closeOverlay('menuOverlay'));
  $('menu-stats').addEventListener('click', () => { closeOverlay('menuOverlay'); renderStats(); showScreen('stats'); });
  $('menu-new').addEventListener('click', () => {
    closeOverlay('menuOverlay');
    if (confirm('Начать новую встречу?')) {
      Storage.clearCurrent();
      if (Api.enabled()) Api.clearState().catch(function () {});
      state = null; h2h = null; showScreen('home');
    }
  });
  $('btn-close-final').addEventListener('click', () => { closeOverlay('finalOverlay'); showScreen('home'); });
  $('btn-new-from-final').addEventListener('click', () => { closeOverlay('finalOverlay'); openSetup(); });
  $('btn-open-stats').addEventListener('click', () => { renderStats(); showScreen('stats'); });
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => showScreen('home'));
  });

  function boot() {
    initTelegram();
    renderHome();

    function apply(cur) {
      if (!cur) { showScreen('home'); return; }
      if (cur.type === 'h2h' || (cur.p1 && cur.p2)) {
        h2h = cur;
        renderH2H();
        showScreen('h2h');
      } else if (cur.type === 'tournament' && cur.state) {
        state = cur.state;
        Tournament.recalcBracket(state);
        renderTournament();
        showScreen('tournament');
      } else if (cur.names && cur.names.length === 4) {
        state = cur;
        renderTournament();
        showScreen('tournament');
      } else showScreen('home');
    }

    if (Api.enabled()) {
      Api.syncAll().then(function (data) {
        // Таблица — источник истины: если очистили игроков/h2h — чистим локально
        try {
          if (data && Array.isArray(data.players)) {
            localStorage.removeItem('liga_players_v3');
            data.players.forEach(function (pl) {
              if (pl.name) Storage.upsertPlayer(pl.name, pl.telegramId);
              if (pl.telegramId) {
                const key = Storage.playerKey(pl.name, pl.telegramId);
                Storage.updatePlayerStats(key, {
                  name: pl.name,
                  telegramId: pl.telegramId,
                  tournaments: pl.tournaments || 0,
                  gold: pl.gold || 0,
                  silver: pl.silver || 0,
                  bronze: pl.bronze || 0,
                  totalWins: pl.totalWins || 0,
                  totalLosses: pl.totalLosses || 0,
                  totalWon: pl.totalWon || 0,
                  totalLost: pl.totalLost || 0,
                  net: pl.net || 0,
                  h2hWins: pl.h2hWins || 0,
                  h2hLosses: pl.h2hLosses || 0
                });
              }
            });
          }
          if (data && Array.isArray(data.h2h)) {
            localStorage.removeItem('liga_h2h_v1');
            // h2h list is read-only from cloud for display; local add still works during session
          }
        } catch (e) { console.warn(e); }

        if (data && data.state) {
          Storage.setCurrent(data.state);
          apply(data.state);
        } else {
          Storage.clearCurrent();
          apply(null);
        }
      }).catch(function () { apply(Storage.getCurrent()); });
    } else {
      apply(Storage.getCurrent());
    }
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  boot();
})();
