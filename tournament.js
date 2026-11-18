/**
 * N players (min 2). Round-robin for any N. group-de only when exactly 4.
 */
const Tournament = (function () {
  const FUNNY_TITLES = [
    "Мастер отскока", "Хранитель лузы", "Самый длинный кий", "Повелитель бортов",
    "Ловкач на сукне", "Невезучий стрелок", "Гроза битка", "Кий-волшебник",
    "Точный, но робкий", "Мастер подставок", "Укротитель шара", "Король серии",
    "Спящий ас", "Шаровой стратег", "Снайпер мелкой лузы", "Магистр отскока",
    "Тихий убийца на сукне", "Кий под подушкой", "Пилот третьего борта",
    "Покоритель дальнего угла", "Джентльмен на сукне", "Фокусник с битком",
    "Стрелок из-за угла", "Сукно-мастер", "Бильярдный поэт", "Аккуратный мститель",
    "Тренер соперника", "Король неудачных отскоков", "Хитрый прицел", "Гуру траектории"
  ];

  function emptyMatrix(n) {
    const m = [];
    for (let r = 0; r < n; r++) {
      m[r] = [];
      for (let c = 0; c < n; c++) m[r][c] = null;
    }
    return m;
  }

  function createEmptyState(players, bet, format) {
    const n = players.length;
    const useDE = format === 'group-de' && n === 4;
    return {
      players: players.map(p => ({
        name: String(p.name || '').trim(),
        telegramId: p.telegramId ? String(p.telegramId) : null
      })),
      names: players.map(p => String(p.name || '').trim()),
      matrix: emptyMatrix(n),
      groupBets: emptyMatrix(n),
      matches: useDE ? {
        m1: { p0: null, p1: null, win: null },
        m2: { p0: null, p1: null, win: null },
        m3: { p0: null, p1: null, win: null },
        m4: { p0: null, p1: null, win: null },
        m5: { p0: null, p1: null, win: null },
        m6: { p0: null, p1: null, win: null }
      } : {},
      matchBets: useDE ? { m1: null, m2: null, m3: null, m4: null, m5: null, m6: null } : {},
      podium: [],
      assignedTitles: {},
      currentBet: bet || 1000,
      format: useDE ? 'group-de' : 'round-robin',
      startedAt: new Date().toISOString(),
      finished: false
    };
  }

  function nPlayers(state) {
    return (state.players && state.players.length) || (state.names && state.names.length) || 0;
  }

  function totalGroupMatches(n) {
    return (n * (n - 1)) / 2;
  }

  function computeGroupScores(state) {
    const n = nPlayers(state);
    const scores = Array(n).fill(0);
    let played = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (state.matrix[r][c] === 1) { scores[r]++; played++; }
      }
    }
    return { scores, played };
  }

  function isGroupComplete(state) {
    return computeGroupScores(state).played === totalGroupMatches(nPlayers(state));
  }

  function computeSeeding(state) {
    const n = nPlayers(state);
    const sc = computeGroupScores(state).scores;
    const idxs = [];
    for (let i = 0; i < n; i++) idxs.push(i);
    idxs.sort((a, b) => {
      if (sc[b] !== sc[a]) return sc[b] - sc[a];
      if (state.matrix[a] && state.matrix[a][b] === 1) return -1;
      if (state.matrix[b] && state.matrix[b][a] === 1) return 1;
      return a - b;
    });
    return idxs;
  }

  function loserOf(m) {
    if (!m || m.win === null || m.p0 === null || m.p1 === null) return null;
    return m.win === m.p0 ? m.p1 : m.p0;
  }

  function assignFunnyTitles(state) {
    const podium = state.podium || [];
    const needed = [];
    for (let i = 1; i < podium.length; i++) {
      if (podium[i] !== null && podium[i] !== undefined && !state.assignedTitles[podium[i]]) {
        needed.push(podium[i]);
      }
    }
    if (!needed.length) return;
    const pool = FUNNY_TITLES.slice().sort(() => Math.random() - 0.5);
    needed.forEach((pIdx, i) => { state.assignedTitles[pIdx] = pool[i % pool.length]; });
  }

  function recalcBracket(state) {
    const n = nPlayers(state);
    if (!n) return;

    if (state.format !== 'group-de') {
      if (isGroupComplete(state)) {
        state.podium = computeSeeding(state);
        state.finished = true;
        assignFunnyTitles(state);
      } else {
        state.podium = [];
        state.finished = false;
      }
      return;
    }

    if (!state.matches || !state.matches.m1) return;

    if (isGroupComplete(state)) {
      const seed = computeSeeding(state);
      state.matches.m1.p0 = seed[0]; state.matches.m1.p1 = seed[3];
      state.matches.m2.p0 = seed[1]; state.matches.m2.p1 = seed[2];
    } else {
      state.matches.m1.p0 = null; state.matches.m1.p1 = null;
      state.matches.m2.p0 = null; state.matches.m2.p1 = null;
    }

    state.matches.m3.p0 = loserOf(state.matches.m1);
    state.matches.m3.p1 = loserOf(state.matches.m2);
    state.matches.m4.p0 = state.matches.m1.win;
    state.matches.m4.p1 = state.matches.m2.win;
    state.matches.m5.p0 = state.matches.m3.win;
    state.matches.m5.p1 = loserOf(state.matches.m4);
    state.matches.m6.p0 = state.matches.m4.win;
    state.matches.m6.p1 = state.matches.m5.win;

    const podium = [null, null, null, null];
    if (state.matches.m6.win !== null) {
      podium[0] = state.matches.m6.win;
      podium[1] = loserOf(state.matches.m6);
      podium[2] = loserOf(state.matches.m5);
      podium[3] = loserOf(state.matches.m3);
      state.finished = true;
    } else {
      state.finished = false;
      if (state.matches.m5.win !== null) {
        podium[2] = loserOf(state.matches.m5);
        podium[3] = loserOf(state.matches.m3);
      }
    }
    state.podium = podium;
    assignFunnyTitles(state);
  }

  function computePrizes(bank, step, places) {
    let s = Number(step);
    if (isNaN(s) || s <= 0) s = 1000;
    const k = places || 4;
    if (bank <= 0) return Array(k).fill(0);
    const total = Math.floor(bank / s) * s;
    if (total <= 0) return Array(k).fill(0);
    const units = total / s;
    if (units < k) {
      const res = Array(k).fill(0);
      for (let i = 0; i < units && i < k; i++) res[i] = s;
      return res;
    }
    const weights = [];
    for (let i = 0; i < k; i++) weights.push(Math.max(1, k - i));
    const wSum = weights.reduce((a, b) => a + b, 0);
    const raw = weights.map(w => Math.max(1, Math.floor((units * w) / wSum)));
    let used = raw.reduce((a, b) => a + b, 0);
    raw[0] += units - used;
    if (raw[0] < 1) raw[0] = 1;
    return raw.map(u => u * s);
  }

  function computeBankAndPrizes(state) {
    const n = nPlayers(state);
    let bank = 0;
    const lossList = [];
    const lossByPlayer = Array(n).fill(0);

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (state.matrix[r][c] === 0) {
          const bet = (state.groupBets[r] && state.groupBets[r][c] != null)
            ? state.groupBets[r][c] : (state.currentBet || 1000);
          bank += bet;
          lossByPlayer[r] += bet;
          lossList.push({ loser: state.names[r], winner: state.names[c], bet });
        }
      }
    }

    if (state.format === 'group-de' && state.matches) {
      Object.keys(state.matches).forEach(mKey => {
        const m = state.matches[mKey];
        if (m.win !== null && m.p0 !== null && m.p1 !== null) {
          const loserIdx = m.win === m.p0 ? m.p1 : m.p0;
          const bet2 = (state.matchBets[mKey] != null) ? state.matchBets[mKey] : (state.currentBet || 1000);
          bank += bet2;
          lossByPlayer[loserIdx] += bet2;
          lossList.push({ loser: state.names[loserIdx], winner: state.names[m.win], bet: bet2 });
        }
      });
    }

    const placeCount = state.format === 'group-de' ? 4 : Math.max(2, n);
    const prizes = computePrizes(bank, state.currentBet, placeCount);
    const prizeByPlayer = Array(n).fill(0);
    const podium = state.podium || [];
    for (let i = 0; i < podium.length; i++) {
      const p = podium[i];
      if (p !== null && p !== undefined) prizeByPlayer[p] = prizes[i] || 0;
    }

    const financeByPlayer = [];
    for (let j = 0; j < n; j++) {
      financeByPlayer[j] = {
        lost: lossByPlayer[j],
        won: prizeByPlayer[j],
        net: prizeByPlayer[j] - lossByPlayer[j]
      };
    }
    return { bank, lossList, lossByPlayer, prizeByPlayer, prizes, financeByPlayer };
  }

  function computeTotalScores(state) {
    const n = nPlayers(state);
    const scores = Array(n).fill(0);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (state.matrix[r][c] === 1) scores[r]++;
    }
    if (state.format === 'group-de' && state.matches) {
      Object.keys(state.matches).forEach(mKey => {
        const m = state.matches[mKey];
        if (m.win !== null) scores[m.win]++;
      });
    }
    return scores;
  }

  function recordGroupWin(state, r, c, bet) {
    const n = nPlayers(state);
    if (r === c || r < 0 || c < 0 || r >= n || c >= n) return false;
    if (state.matrix[r][c] !== null || state.matrix[c][r] !== null) return false;
    state.matrix[r][c] = 1;
    state.matrix[c][r] = 0;
    if (!state.groupBets[r]) state.groupBets[r] = [];
    state.groupBets[r][c] = bet;
    state.currentBet = bet;
    recalcBracket(state);
    return true;
  }

  function recordPlayoffWin(state, mKey, slotIdx, bet) {
    if (state.format !== 'group-de' || !state.matches[mKey]) return false;
    const m = state.matches[mKey];
    const pTarget = slotIdx === 0 ? m.p0 : m.p1;
    const pOpponent = slotIdx === 0 ? m.p1 : m.p0;
    if (pTarget === null || pOpponent === null || m.win !== null) return false;
    m.win = pTarget;
    state.matchBets[mKey] = bet;
    state.currentBet = bet;
    recalcBracket(state);
    return true;
  }

  function isFinished(state) {
    if (state.finished) return true;
    if (state.format === 'group-de') {
      return state.matches && state.matches.m6 && state.matches.m6.win !== null;
    }
    return isGroupComplete(state);
  }

  function buildArchiveRecord(state) {
    const bp = computeBankAndPrizes(state);
    const scores = computeTotalScores(state);
    const players = [];
    const podium = (state.podium || []).filter(p => p !== null && p !== undefined);
    podium.forEach((pIdx, i) => {
      const title = i === 0 ? '👑 Повелитель кия' : (state.assignedTitles[pIdx] || 'Мастер сукна');
      const f = bp.financeByPlayer[pIdx];
      const pl = state.players[pIdx] || {};
      players.push({
        place: i + 1,
        name: state.names[pIdx],
        telegramId: pl.telegramId || null,
        title,
        wins: scores[pIdx],
        lost: f.lost,
        won: f.won,
        net: f.net
      });
    });
    return {
      id: 'T' + Date.now(),
      date: new Date().toISOString(),
      sport: 'billiard',
      format: state.format,
      bet: state.currentBet,
      bank: bp.bank,
      players
    };
  }

  function applyToPlayerStats(record) {
    record.players.forEach(p => {
      const key = Storage.playerKey(p.name, p.telegramId);
      Storage.upsertPlayer(p.name, p.telegramId);
      const cur = Storage.getPlayerByKey(key) || {};
      const patch = {
        name: p.name,
        telegramId: p.telegramId || cur.telegramId || null,
        tournaments: (cur.tournaments || 0) + 1,
        totalWins: (cur.totalWins || 0) + (p.wins || 0),
        totalWon: (cur.totalWon || 0) + (p.won || 0),
        totalLost: (cur.totalLost || 0) + (p.lost || 0),
        net: (cur.net || 0) + (p.net || 0)
      };
      if (p.place === 1) patch.gold = (cur.gold || 0) + 1;
      if (p.place === 2) patch.silver = (cur.silver || 0) + 1;
      if (p.place === 3) patch.bronze = (cur.bronze || 0) + 1;
      Storage.updatePlayerStats(key, patch);
    });
  }

  return {
    createEmptyState, recalcBracket, computeBankAndPrizes, computeTotalScores,
    computeGroupScores, isGroupComplete, totalGroupMatches, nPlayers,
    recordGroupWin, recordPlayoffWin, isFinished, buildArchiveRecord, applyToPlayerStats,
    shortName(n) { if (!n) return '?'; return n.length > 8 ? n.slice(0, 7) + '…' : n; },
    pluralMatch(n) {
      const mod10 = n % 10, mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) return 'матч';
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'матча';
      return 'матчей';
    }
  };
})();
