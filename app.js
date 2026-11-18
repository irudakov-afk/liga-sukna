(function () {
  'use strict';

  let state = null;
  let finalOpened = false;

  // ---------- Navigation ----------
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.add('active');
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg || 'Сохранено';
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1600);
  }

  // ---------- Home ----------
  const SPORTS = [
    { id: 'billiard', name: 'Бильярд', icon: '🎱', desc: 'Группа 4×4 + Double Elimination', active: true },
    { id: 'bowling', name: 'Боулинг', icon: '🎳', desc: 'Скоро', active: false },
    { id: 'cards', name: 'Карты', icon: '🃏', desc: 'Скоро', active: false },
    { id: 'custom', name: 'Свой спор', icon: '🤝', desc: 'Скоро', active: false }
  ];

  function renderHome() {
    const grid = document.getElementById('sport-grid');
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
  function openSetup(sportId) {
    document.getElementById('setup-title').textContent =
      sportId === 'billiard' ? 'Бильярд — новый турнир' : 'Новый спор';
    document.getElementById('setup-bet').value = 1000;
    renderPlayerInputs();
    renderSuggestions();
    showScreen('setup');
  }

  function renderPlayerInputs() {
    const box = document.getElementById('player-inputs');
    box.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const div = document.createElement('div');
      div.className = 'player-slot';
      div.innerHTML = `
        <span class="slot-num">${i + 1}</span>
        <input type="text" placeholder="Имя игрока" maxlength="24" data-idx="${i}" autocomplete="off">
      `;
      box.appendChild(div);
    }
  }

  function renderSuggestions() {
    const list = Storage.getPlayerList().slice(0, 8);
    const row = document.getElementById('suggest-row');
    if (!list.length) {
      row.innerHTML = '';
      return;
    }
    row.innerHTML = list.map(p =>
      `<button type="button" class="suggest-chip" data-name="${escapeAttr(p.name)}">${escapeHtml(p.name)}</button>`
    ).join('');
    row.querySelectorAll('.suggest-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const inputs = document.querySelectorAll('#player-inputs input');
        for (const inp of inputs) {
          if (!inp.value.trim()) {
            inp.value = btn.dataset.name;
            break;
          }
        }
      });
    });
  }

  function getSetupNames() {
    return Array.from(document.querySelectorAll('#player-inputs input'))
      .map(i => i.value.trim())
      .filter(Boolean);
  }

  document.getElementById('btn-start-tournament').addEventListener('click', () => {
    const names = getSetupNames();
    if (names.length !== 4) {
      alert('Нужно ровно 4 участника');
      return;
    }
    const unique = new Set(names.map(n => n.toLowerCase()));
    if (unique.size !== 4) {
      alert('Имена должны быть разными');
      return;
    }
    const bet = Math.max(0, parseInt(document.getElementById('setup-bet').value, 10) || 1000);
    names.forEach(n => Storage.upsertPlayer(n));
    state = Tournament.createEmptyState(names, bet);
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

  // ---------- Tournament UI ----------
  function renderTournament() {
    if (!state) return;
    Tournament.recalcBracket(state);
    renderBank();
    renderLeaderboard();
    renderDebts();
    renderGroupMatrix();
    renderBrackets();
    Storage.setCurrent(state);
  }

  function renderBank() {
    const bp = Tournament.computeBankAndPrizes(state);
    document.getElementById('bank-value').textContent =
      bp.bank.toLocaleString('ru-RU') + ' ₽';
  }

  function renderLeaderboard() {
    const bp = Tournament.computeBankAndPrizes(state);
    const scores = Tournament.computeTotalScores(state);
    const rows = state.names.map((name, i) => ({
      name, score: scores[i], net: bp.financeByPlayer[i].net, idx: i
    })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const tbody = document.getElementById('leaderboard-body');
    tbody.innerHTML = rows.map((p, idx) => {
      const netSign = p.net > 0 ? '+' : (p.net < 0 ? '−' : '');
      const netTxt = p.net === 0 ? '—' : (netSign + Math.abs(p.net).toLocaleString('ru-RU') + ' ₽');
      return `<tr>
        <td class="rank-num">#${idx + 1}</td>
        <td><b>${escapeHtml(p.name)}</b></td>
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
    if (!state.names.length) { root.innerHTML = ''; return; }

    let html = '<div class="cell head"></div>';
    for (let i = 0; i < 4; i++) {
      html += `<div class="cell head">${Tournament.shortName(state.names[i])}</div>`;
    }
    for (let r = 0; r < 4; r++) {
      html += `<div class="cell head-col">${Tournament.shortName(state.names[r])}</div>`;
      for (let c = 0; c < 4; c++) {
        if (r === c) {
          html += '<div class="cell diag">—</div>';
        } else {
          const v = state.matrix[r][c];
          let cls = 'cell';
          let txt = '·';
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
        const r = +cell.dataset.r;
        const c = +cell.dataset.c;
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

    wb.innerHTML = `
      <div class="bracket-col-label">WB Полуфиналы</div>
      ${matchHtml('m1')}
      ${matchHtml('m2')}
      <div class="bracket-col-label" style="margin-top:12px">WB Финал</div>
      ${matchHtml('m4')}
      <div class="bracket-col-label" style="margin-top:12px">Grand Final</div>
      ${matchHtml('m6')}
    `;

    lb.innerHTML = `
      <div class="bracket-col-label">LB Раунд 1</div>
      ${matchHtml('m3')}
      <div class="bracket-col-label" style="margin-top:12px">LB Финал</div>
      ${matchHtml('m5')}
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
    const playable = m.p0 !== null && m.p1 !== null && m.win === null;
    const dis = playable ? '' : ' disabled';
    const n0 = m.p0 !== null ? state.names[m.p0] : 'Ожидание…';
    const n1 = m.p1 !== null ? state.names[m.p1] : 'Ожидание…';
    const c0 = m.win === m.p0 && m.p0 !== null ? ' is-winner' : (m.win !== null ? ' is-loser' : '');
    const c1 = m.win === m.p1 && m.p1 !== null ? ' is-winner' : (m.win !== null ? ' is-loser' : '');
    return `
      <div class="match-node${dis}">
        <div class="player-row${c0}" data-m="${mKey}" data-slot="0"><span class="player-name">${escapeHtml(n0)}</span></div>
        <div class="player-row${c1}" data-m="${mKey}" data-slot="1"><span class="player-name">${escapeHtml(n1)}</span></div>
      </div>
    `;
  }

  function checkFinished() {
    if (Tournament.isFinished(state) && !finalOpened) {
      setTimeout(() => {
        renderFinalModal();
        openOverlay('finalOverlay');
        finalOpened = true;
        // archive
        const record = Tournament.buildArchiveRecord(state);
        Storage.addTournament(record);
        Tournament.applyToPlayerStats(record);
        Storage.clearCurrent();
      }, 350);
    }
  }

  function renderFinalModal() {
    const bp = Tournament.computeBankAndPrizes(state);
    const medals = ['🥇', '🥈', '🥉', '4️⃣'];
    const list = document.getElementById('final-list');
    list.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const pIdx = state.podium[i];
      if (pIdx === null) continue;
      const title = i === 0 ? '👑 Повелитель кия' : (state.assignedTitles[pIdx] || 'Мастер сукна');
      const amount = bp.prizes[i];
      const amountTxt = amount > 0 ? amount.toLocaleString('ru-RU') + ' ₽' : '—';
      const cls = i === 0 ? 'final-item champion' : 'final-item';
      list.innerHTML += `
        <div class="${cls}">
          <div class="medal">${medals[i]}</div>
          <div class="info">
            <div class="name">${escapeHtml(state.names[pIdx])}</div>
            <div class="title">${escapeHtml(title)}</div>
          </div>
          <div class="prize">${amountTxt}</div>
        </div>
      `;
    }

    const body = document.getElementById('final-summary-body');
    let table = '<div class="sum-table">';
    table += '<div class="s-cell head name">Игрок</div><div class="s-cell head">Внёс</div><div class="s-cell head">Выиграл</div><div class="s-cell head">Итог</div>';
    for (let k = 0; k < 4; k++) {
      const idx = state.podium[k];
      if (idx === null) continue;
      const f = bp.financeByPlayer[idx];
      const netCls = f.net > 0 ? 'plus' : (f.net < 0 ? 'minus' : '');
      const netSign = f.net > 0 ? '+' : (f.net < 0 ? '−' : '');
      const netTxt = netSign + Math.abs(f.net).toLocaleString('ru-RU') + ' ₽';
      table += `<div class="s-cell name">${escapeHtml(state.names[idx])}</div>`;
      table += `<div class="s-cell lost">−${f.lost.toLocaleString('ru-RU')} ₽</div>`;
      table += `<div class="s-cell won">+${f.won.toLocaleString('ru-RU')} ₽</div>`;
      table += `<div class="s-cell total ${netCls}">${netTxt}</div>`;
    }
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
      return `
        <div class="stat-card">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="stat-grid">
            <div class="stat-item"><div class="val">${p.tournaments || 0}</div><div class="lbl">Турниров</div></div>
            <div class="stat-item"><div class="val">${p.gold || 0}</div><div class="lbl">🥇</div></div>
            <div class="stat-item"><div class="val">${wr}%</div><div class="lbl">Винрейт</div></div>
            <div class="stat-item"><div class="val">${p.totalWins || 0}</div><div class="lbl">Побед</div></div>
            <div class="stat-item"><div class="val">${p.silver || 0} / ${p.bronze || 0}</div><div class="lbl">🥈 / 🥉</div></div>
            <div class="stat-item net ${netCls}"><div class="val">${netSign}${Math.abs(p.net || 0).toLocaleString('ru-RU')}</div><div class="lbl">Баланс ₽</div></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ---------- Overlays & menu ----------
  function openOverlay(id) {
    document.getElementById(id).classList.add('active');
  }
  function closeOverlay(id) {
    document.getElementById(id).classList.remove('active');
  }

  document.getElementById('debtsToggle').addEventListener('click', () => {
    const body = document.getElementById('debtsBody');
    const btn = document.getElementById('debtsToggle');
    const exp = body.classList.toggle('expanded');
    btn.textContent = exp ? 'Свернуть' : 'Развернуть';
  });

  document.getElementById('btn-menu-t').addEventListener('click', () => openOverlay('menuOverlay'));
  document.getElementById('menu-close').addEventListener('click', () => closeOverlay('menuOverlay'));
  document.getElementById('menu-stats').addEventListener('click', () => {
    closeOverlay('menuOverlay');
    renderStats();
    showScreen('stats');
  });
  document.getElementById('menu-new').addEventListener('click', () => {
    closeOverlay('menuOverlay');
    if (confirm('Начать новый турнир? Текущий прогресс будет потерян, если турнир не завершён.')) {
      Storage.clearCurrent();
      state = null;
      finalOpened = false;
      showScreen('home');
    }
  });

  document.getElementById('btn-close-final').addEventListener('click', () => {
    closeOverlay('finalOverlay');
    showScreen('home');
  });
  document.getElementById('btn-new-from-final').addEventListener('click', () => {
    closeOverlay('finalOverlay');
    openSetup('billiard');
  });

  document.getElementById('btn-open-stats').addEventListener('click', () => {
    renderStats();
    showScreen('stats');
  });

  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.back;
      if (target === 'home') showScreen('home');
    });
  });

  // ---------- Helpers ----------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  // ---------- Boot ----------
  function boot() {
    renderHome();

    // restore unfinished tournament
    const saved = Storage.getCurrent();
    if (saved && saved.names && saved.names.length === 4 && !Tournament.isFinished(saved)) {
      state = saved;
      Tournament.recalcBracket(state);
      renderTournament();
      showScreen('tournament');
    } else {
      showScreen('home');
    }

    // intro
    const intro = document.getElementById('intro-overlay');
    if (intro && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTimeout(() => {
        intro.classList.add('fade-out');
        setTimeout(() => intro.remove(), 600);
      }, 2200);
    } else if (intro) {
      intro.remove();
    }
  }

  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  boot();
})();
