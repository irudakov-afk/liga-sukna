(function () {
  'use strict';

  let state = null;
  let finalOpened = false;
  let setupCount = 2;
  let tgUser = null;

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.add('active');
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg || 'Сохранено';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1600);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---------- Telegram ----------
  function initTelegram() {
    if (window.Telegram && Telegram.WebApp) {
      Telegram.WebApp.ready();
      Telegram.WebApp.expand();
      const u = Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user;
      if (u && u.id) {
        tgUser = {
          id: String(u.id),
          name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || ('ID ' + u.id),
          username: u.username || null
        };
        Storage.setMe(tgUser);
        Storage.upsertPlayer(tgUser.name, tgUser.id);
      }
    } else {
      tgUser = Storage.getMe();
    }
    updateMeBadge();
  }

  function updateMeBadge() {
    const el = document.getElementById('me-badge');
    if (!el) return;
    if (tgUser && tgUser.id) {
      el.textContent = 'Вы: ' + tgUser.name + ' · ID ' + tgUser.id;
      el.style.display = 'block';
    } else {
      el.textContent = 'Telegram ID не определён (откройте через бота)';
      el.style.display = 'block';
    }
  }

  // ---------- Home ----------
  const SPORTS = [
    { id: 'billiard', name: 'Бильярд', icon: '🎱', desc: 'От 2 игроков · круговая + DE на 4', active: true },
    { id: 'bowling', name: 'Боулинг', icon: '🎳', desc: 'Скоро', active: false },
    { id: 'cards', name: 'Карты', icon: '🃏', desc: 'Скоро', active: false },
    { id: 'custom', name: 'Свой спор', icon: '🤝', desc: 'Скоро', active: false }
  ];

  function renderHome() {
    const grid = document.getElementById('sport-grid');
    if (!grid) return;
    grid.innerHTML = SPORTS.map(s => `
      <div class="sport-card ${s.active ? 'active-sport' : 'disabled'}" data-sport="${s.id}">
        ${s.active ? '<span class="badge">Готово</span>' : '<span class="badge">Скоро</span>'}
        <div>
          <div class="sport-icon">${s.icon}</div>
          <h3>${s.name}</h3>
          <p>${s.desc}</p>
        </div>
      </div>
    `).join('');
    grid.querySelectorAll('.sport-card.active-sport').forEach(card => {
      card.addEventListener('click', () => openSetup(card.dataset.sport));
    });
  }

  // ---------- Setup ----------
  function openSetup() {
    setupCount = 2;
    document.getElementById('setup-bet').value = 1000;
    renderPlayerInputs();
    renderSuggestions();
    showScreen('setup');
  }

  function renderPlayerInputs() {
    const box = document.getElementById('player-inputs');
    box.innerHTML = '';
    for (let i = 0; i < setupCount; i++) {
      const div = document.createElement('div');
      div.className = 'player-slot-block';
      div.innerHTML = `
        <div class="player-slot">
          <span class="slot-num">${i + 1}</span>
          <input type="text" class="p-name" placeholder="Имя" maxlength="24" data-idx="${i}" autocomplete="off">
        </div>
        <div class="player-slot tg-slot">
          <span class="slot-num">ID</span>
          <input type="text" class="p-tg" placeholder="Telegram ID (необязательно)" inputmode="numeric" data-idx="${i}" autocomplete="off">
        </div>
      `;
      box.appendChild(div);
    }
    // prefill first slot with current TG user
    if (tgUser && tgUser.id) {
      const name0 = box.querySelector('.p-name[data-idx="0"]');
      const tg0 = box.querySelector('.p-tg[data-idx="0"]');
      if (name0 && !name0.value) name0.value = tgUser.name;
      if (tg0 && !tg0.value) tg0.value = tgUser.id;
    }
  }

  function renderSuggestions() {
    const list = Storage.getPlayerList().slice(0, 10);
    const row = document.getElementById('suggest-row');
    if (!row) return;
    if (!list.length) { row.innerHTML = ''; return; }
    row.innerHTML = list.map(p => {
      const label = p.telegramId ? `${escapeHtml(p.name)} · ${p.telegramId}` : escapeHtml(p.name);
      return `<button type="button" class="suggest-chip" data-name="${escapeHtml(p.name)}" data-tg="${p.telegramId || ''}">${label}</button>`;
    }).join('');
    row.querySelectorAll('.suggest-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const names = document.querySelectorAll('#player-inputs .p-name');
        const tgs = document.querySelectorAll('#player-inputs .p-tg');
        for (let i = 0; i < names.length; i++) {
          if (!names[i].value.trim()) {
            names[i].value = btn.dataset.name;
            if (tgs[i]) tgs[i].value = btn.dataset.tg || '';
            break;
          }
        }
      });
    });
  }

  function getSetupPlayers() {
    const names = document.querySelectorAll('#player-inputs .p-name');
    const tgs = document.querySelectorAll('#player-inputs .p-tg');
    const out = [];
    for (let i = 0; i < names.length; i++) {
      const name = names[i].value.trim();
      if (!name) continue;
      const telegramId = (tgs[i] && tgs[i].value.trim()) || null;
      out.push({ name, telegramId });
    }
    return out;
  }

  document.getElementById('btn-add-player')?.addEventListener('click', () => {
    if (setupCount >= 8) { alert('Максимум 8 игроков'); return; }
    setupCount++;
    renderPlayerInputs();
  });
  document.getElementById('btn-remove-player')?.addEventListener('click', () => {
    if (setupCount <= 2) { alert('Минимум 2 игрока'); return; }
    setupCount--;
    renderPlayerInputs();
  });

  document.getElementById('btn-start-tournament')?.addEventListener('click', () => {
    const players = getSetupPlayers();
    if (players.length < 2) { alert('Нужно минимум 2 участника'); return; }
    const nameSet = new Set(players.map(p => p.name.toLowerCase()));
    if (nameSet.size !== players.length) { alert('Имена должны быть разными'); return; }

    const bet = Math.max(0, parseInt(document.getElementById('setup-bet').value, 10) || 1000);
    const formatChip = document.querySelector('#format-chips .chip.active');
    let format = formatChip ? formatChip.dataset.format : 'round-robin';
    if (format === 'group-de' && players.length !== 4) {
      alert('Double Elimination доступен только для 4 игроков. Будет круговая система.');
      format = 'round-robin';
    }

    players.forEach(p => Storage.upsertPlayer(p.name, p.telegramId));
    state = Tournament.createEmptyState(players, bet, format);
    Tournament.recalcBracket(state);
    Storage.setCurrent(state);
    finalOpened = false;
    renderTournament();
    showScreen('tournament');
  });

  document.querySelectorAll('.quick-bets button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('setup-bet').value = btn.dataset.bet;
    });
  });

  document.querySelectorAll('#format-chips .chip:not(.disabled)').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#format-chips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  // ---------- Tournament UI ----------
  function renderTournament() {
    if (!state) return;
    Tournament.recalcBracket(state);
    renderBank();
    renderLeaderboard();
    renderDebts();
    renderGroupMatrix();
    renderBrackets();
    highlightMe();
    Storage.setCurrent(state);
    cloudSaveState();
  }

  function highlightMe() {
    // optional visual — names matching current TG
    if (!tgUser || !state) return;
  }

  function renderBank() {
    const bp = Tournament.computeBankAndPrizes(state);
    document.getElementById('bank-value').textContent = bp.bank.toLocaleString('ru-RU') + ' ₽';
  }

  function renderLeaderboard() {
    const bp = Tournament.computeBankAndPrizes(state);
    const scores = Tournament.computeTotalScores(state);
    const rows = state.names.map((name, i) => ({
      name, score: scores[i], net: bp.financeByPlayer[i].net,
      tg: state.players[i] && state.players[i].telegramId,
      idx: i
    })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = rows.map((p, idx) => {
      const netSign = p.net > 0 ? '+' : (p.net < 0 ? '−' : '');
      const netTxt = p.net === 0 ? '—' : (netSign + Math.abs(p.net).toLocaleString('ru-RU') + ' ₽');
      const me = tgUser && p.tg && String(p.tg) === String(tgUser.id);
      return `<tr class="${me ? 'is-me' : ''}">
        <td class="rank-num">#${idx + 1}</td>
        <td><b>${escapeHtml(p.name)}</b>${me ? ' · вы' : ''}${p.tg ? '<div class="tg-id">' + p.tg + '</div>' : ''}</td>
        <td>${p.score}</td>
        <td>${netTxt}</td>
      </tr>`;
    }).join('');
  }

  function renderDebts() {
    const bp = Tournament.computeBankAndPrizes(state);
    document.getElementById('debts-count').textContent =
      bp.lossList.length + ' ' + Tournament.pluralMatch(bp.lossList.length);
    const list = document.getElementById('debts-list');
    if (!bp.lossList.length) {
      list.innerHTML = '<div class="debt-card empty">Пока никто не проигрывал</div>';
    } else {
      list.innerHTML = bp.lossList.map(d => `
        <div class="debt-card">
          <span><b>${escapeHtml(d.loser)}</b> → <b>${escapeHtml(d.winner)}</b></span>
          <span class="debt-cash">${d.bet.toLocaleString('ru-RU')} ₽</span>
        </div>
      `).join('');
    }
  }

  function renderGroupMatrix() {
    const root = document.getElementById('group-matrix');
    const n = Tournament.nPlayers(state);
    if (!n) { root.innerHTML = ''; return; }

    // dynamic columns
    root.style.gridTemplateColumns = `1fr ${'1fr '.repeat(n)}`.trim();

    let html = '<div class="cell head"></div>';
    for (let i = 0; i < n; i++) {
      html += `<div class="cell head">${Tournament.shortName(state.names[i])}</div>`;
    }
    for (let r = 0; r < n; r++) {
      html += `<div class="cell head-col">${Tournament.shortName(state.names[r])}</div>`;
      for (let c = 0; c < n; c++) {
        if (r === c) {
          html += '<div class="cell diag">—</div>';
        } else {
          const v = state.matrix[r][c];
          let cls = 'cell', txt = '·';
          if (v === 1) { cls += ' win'; txt = '✓'; }
          else if (v === 0) { cls += ' lose'; txt = '✕'; }
          else { cls += ' clickable'; }
          const canClick = v === null && state.matrix[c][r] === null;
          const onclick = canClick ? ` data-r="${r}" data-c="${c}"` : '';
          html += `<div class="${cls}"${onclick}>${txt}</div>`;
        }
      }
    }
    root.innerHTML = html;
    root.querySelectorAll('.cell.clickable').forEach(cell => {
      cell.addEventListener('click', () => {
        const r = +cell.dataset.r, c = +cell.dataset.c;
        const bet = state.currentBet || 1000;
        if (Tournament.recordGroupWin(state, r, c, bet)) {
          renderTournament();
          toast();
          checkFinished();
        }
      });
    });
  }

  function renderBrackets() {
    const wb = document.getElementById('bracket-wb');
    const lb = document.getElementById('bracket-lb');
    const playoffPanel = document.getElementById('playoff-panel');

    if (state.format !== 'group-de') {
      if (playoffPanel) playoffPanel.style.display = 'none';
      if (wb) wb.innerHTML = '';
      if (lb) lb.innerHTML = '';
      return;
    }
    if (playoffPanel) playoffPanel.style.display = '';

    wb.innerHTML = `
      <div class="bracket-col-label">WB Полуфиналы</div>
      ${matchHtml('m1')}${matchHtml('m2')}
      <div class="bracket-col-label" style="margin-top:12px">WB Финал</div>
      ${matchHtml('m4')}
      <div class="bracket-col-label" style="margin-top:12px">Grand Final</div>
      ${matchHtml('m6')}
    `;
    lb.innerHTML = `
      <div class="bracket-col-label">LB Раунд 1</div>${matchHtml('m3')}
      <div class="bracket-col-label" style="margin-top:12px">LB Финал</div>${matchHtml('m5')}
    `;

    document.querySelectorAll('.player-row[data-m]').forEach(row => {
      row.addEventListener('click', () => {
        const mKey = row.dataset.m;
        const slot = +row.dataset.slot;
        const bet = state.currentBet || 1000;
        if (Tournament.recordPlayoffWin(state, mKey, slot, bet)) {
          renderTournament();
          toast();
          checkFinished();
        }
      });
    });
  }

  function matchHtml(mKey) {
    const m = state.matches[mKey];
    if (!m) return '';
    const playable = m.p0 !== null && m.p1 !== null && m.win === null;
    const dis = playable ? '' : ' disabled';
    const n0 = m.p0 !== null ? state.names[m.p0] : 'Ожидание…';
    const n1 = m.p1 !== null ? state.names[m.p1] : 'Ожидание…';
    const c0 = m.win === m.p0 && m.p0 !== null ? ' is-winner' : (m.win !== null ? ' is-loser' : '');
    const c1 = m.win === m.p1 && m.p1 !== null ? ' is-winner' : (m.win !== null ? ' is-loser' : '');
    return `<div class="match-node${dis}">
      <div class="player-row${c0}" data-m="${mKey}" data-slot="0"><span class="player-name">${escapeHtml(n0)}</span></div>
      <div class="player-row${c1}" data-m="${mKey}" data-slot="1"><span class="player-name">${escapeHtml(n1)}</span></div>
    </div>`;
  }

  function checkFinished() {
    if (Tournament.isFinished(state) && !finalOpened) {
      setTimeout(() => {
        renderFinalModal();
        openOverlay('finalOverlay');
        finalOpened = true;
        const record = Tournament.buildArchiveRecord(state);
        Storage.addTournament(record);
        Tournament.applyToPlayerStats(record);
        Storage.clearCurrent();
        if (Api.enabled()) {
          Api.archiveTournament(record).catch(function (e) { console.warn(e); });
        }
      }, 350);
    }
  }

  function renderFinalModal() {
    const bp = Tournament.computeBankAndPrizes(state);
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
    const list = document.getElementById('final-list');
    list.innerHTML = '';
    const podium = (state.podium || []).filter(p => p !== null && p !== undefined);
    podium.forEach((pIdx, i) => {
      const title = i === 0 ? '👑 Повелитель кия' : (state.assignedTitles[pIdx] || 'Мастер сукна');
      const amount = bp.prizes[i] || 0;
      const amountTxt = amount > 0 ? amount.toLocaleString('ru-RU') + ' ₽' : '—';
      const cls = i === 0 ? 'final-item champion' : 'final-item';
      list.innerHTML += `<div class="${cls}">
        <div class="medal">${medals[i] || (i + 1)}</div>
        <div class="info">
          <div class="name">${escapeHtml(state.names[pIdx])}</div>
          <div class="title">${escapeHtml(title)}</div>
        </div>
        <div class="prize">${amountTxt}</div>
      </div>`;
    });

    const body = document.getElementById('final-summary-body');
    let table = '<div class="sum-table">';
    table += '<div class="s-cell head name">Игрок</div><div class="s-cell head">Внёс</div><div class="s-cell head">Выиграл</div><div class="s-cell head">Итог</div>';
    podium.forEach(idx => {
      const f = bp.financeByPlayer[idx];
      const netCls = f.net > 0 ? 'plus' : (f.net < 0 ? 'minus' : '');
      const netSign = f.net > 0 ? '+' : (f.net < 0 ? '−' : '');
      const netTxt = netSign + Math.abs(f.net).toLocaleString('ru-RU') + ' ₽';
      table += `<div class="s-cell name">${escapeHtml(state.names[idx])}</div>`;
      table += `<div class="s-cell lost">−${f.lost.toLocaleString('ru-RU')} ₽</div>`;
      table += `<div class="s-cell won">+${f.won.toLocaleString('ru-RU')} ₽</div>`;
      table += `<div class="s-cell total ${netCls}">${netTxt}</div>`;
    });
    table += '</div>';
    body.innerHTML = table;
  }

  // ---------- Stats ----------
  function renderStats() {
    const players = Storage.getPlayerList();
    const body = document.getElementById('stats-body');
    if (!players.length) {
      body.innerHTML = '<div class="empty-stats">Пока нет статистики.<br>Завершите первый турнир.</div>';
      return;
    }
    body.innerHTML = players.map(p => {
      const games = (p.totalWins || 0) + (p.totalLosses || 0);
      const wr = games > 0 ? Math.round((p.totalWins / games) * 100) : 0;
      const netCls = p.net > 0 ? 'plus' : (p.net < 0 ? 'minus' : '');
      const netSign = p.net > 0 ? '+' : (p.net < 0 ? '−' : '');
      const me = tgUser && p.telegramId && String(p.telegramId) === String(tgUser.id);
      return `<div class="stat-card ${me ? 'is-me' : ''}">
        <div class="name">${escapeHtml(p.name)}${me ? ' · вы' : ''}</div>
        ${p.telegramId ? '<div class="tg-id">TG ID: ' + p.telegramId + '</div>' : ''}
        <div class="stat-grid">
          <div class="stat-item"><div class="val">${p.tournaments || 0}</div><div class="lbl">Турниров</div></div>
          <div class="stat-item"><div class="val">${p.gold || 0}</div><div class="lbl">🥇</div></div>
          <div class="stat-item"><div class="val">${wr}%</div><div class="lbl">Винрейт</div></div>
          <div class="stat-item"><div class="val">${p.totalWins || 0}</div><div class="lbl">Побед</div></div>
          <div class="stat-item"><div class="val">${p.silver || 0} / ${p.bronze || 0}</div><div class="lbl">🥈 / 🥉</div></div>
          <div class="stat-item net ${netCls}"><div class="val">${netSign}${Math.abs(p.net || 0).toLocaleString('ru-RU')}</div><div class="lbl">Баланс ₽</div></div>
        </div>
      </div>`;
    }).join('');
  }

  // ---------- overlays ----------
  function openOverlay(id) { document.getElementById(id).classList.add('active'); }
  function closeOverlay(id) { document.getElementById(id).classList.remove('active'); }

  document.getElementById('debtsToggle')?.addEventListener('click', () => {
    const body = document.getElementById('debtsBody');
    const btn = document.getElementById('debtsToggle');
    const exp = body.classList.toggle('expanded');
    btn.textContent = exp ? 'Свернуть' : 'Развернуть';
  });

  document.getElementById('btn-menu-t')?.addEventListener('click', () => openOverlay('menuOverlay'));
  document.getElementById('menu-close')?.addEventListener('click', () => closeOverlay('menuOverlay'));
  document.getElementById('menu-stats')?.addEventListener('click', () => {
    closeOverlay('menuOverlay'); renderStats(); showScreen('stats');
  });
  document.getElementById('menu-new')?.addEventListener('click', () => {
    closeOverlay('menuOverlay');
    if (confirm('Начать новый турнир? Незавершённый прогресс будет потерян.')) {
      Storage.clearCurrent(); state = null; finalOpened = false; showScreen('home');
    }
  });
  document.getElementById('btn-close-final')?.addEventListener('click', () => {
    closeOverlay('finalOverlay'); showScreen('home');
  });
  document.getElementById('btn-new-from-final')?.addEventListener('click', () => {
    closeOverlay('finalOverlay'); openSetup();
  });
  document.getElementById('btn-open-stats')?.addEventListener('click', () => {
    renderStats(); showScreen('stats');
  });
  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => { if (btn.dataset.back === 'home') showScreen('home'); });
  });


  function cloudSaveState() {
    if (!Api.enabled() || !state) return;
    Api.saveState(state).catch(function (e) { console.warn('cloud save', e); });
  }

  function cloudLoadState() {
    if (!Api.enabled()) return Promise.resolve(null);
    return Api.getState().catch(function () { return null; });
  }

  // ---------- Boot ----------
  function boot() {
    initTelegram();
    renderHome();

    function applySaved(saved) {
      if (saved && saved.names && saved.names.length >= 2 && !Tournament.isFinished(saved)) {
        state = saved;
        if (!state.players) {
          state.players = state.names.map(n => ({ name: n, telegramId: null }));
        }
        Tournament.recalcBracket(state);
        renderTournament();
        showScreen('tournament');
      } else {
        showScreen('home');
      }
    }

    cloudLoadState().then(function (cloud) {
      if (cloud) {
        Storage.setCurrent(cloud);
        applySaved(cloud);
      } else {
        applySaved(Storage.getCurrent());
      }
    }).catch(function () {
      applySaved(Storage.getCurrent());
    });
    const intro = document.getElementById('intro-overlay');
    if (intro && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTimeout(() => {
        intro.classList.add('fade-out');
        setTimeout(() => intro.remove(), 600);
      }, 1800);
    } else if (intro) intro.remove();
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  boot();
})();
