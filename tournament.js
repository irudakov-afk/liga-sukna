/**
 * Core tournament engine — 4 players, round-robin group + Double Elimination.
 * Adapted from the original Google Apps Script / HTML version.
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

  function createEmptyState(names, bet) {
    return {
      names: names.slice(0, 4),
      matrix: [
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null]
      ],
      matches: {
        m1: { p0: null, p1: null, win: null },
        m2: { p0: null, p1: null, win: null },
        m3: { p0: null, p1: null, win: null },
        m4: { p0: null, p1: null, win: null },
        m5: { p0: null, p1: null, win: null },
        m6: { p0: null, p1: null, win: null }
      },
      podium: [null, null, null, null],
      assignedTitles: {},
      currentBet: bet || 1000,
      groupBets: [
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null]
      ],
      matchBets: { m1: null, m2: null, m3: null, m4: null, m5: null, m6: null },
      startedAt: new Date().toISOString()
    };
  }

  function computeGroupScores(state) {
    const scores = [0, 0, 0, 0];
    let played = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (state.matrix[r][c] === 1) {
          scores[r]++;
          played++;
        }
      }
    }
    return { scores, played };
  }

  function isGroupComplete(state) {
    return computeGroupScores(state).played === 6;
  }

  function computeSeeding(state) {
    const sc = computeGroupScores(state).scores;
    const idxs = [0, 1, 2, 3];
    idxs.sort((a, b) => {
      if (sc[b] !== sc[a]) return sc[b] - sc[a];
      if (state.matrix[a][b] === 1) return -1;
      if (state.matrix[b][a] === 1) return 1;
      return a - b;
    });
    return idxs;
  }

  function loserOf(m) {
    if (m.win === null || m.p0 === null || m.p1 === null) return null;
    return m.win === m.p0 ? m.p1 : m.p0;
  }

  function recalcBracket(state) {
    if (!state.names.length) return;

    if (isGroupComplete(state)) {
      const seed = computeSeeding(state);
      state.matches.m1.p0 = seed[0];
      state.matches.m1.p1 = seed[3];
      state.matches.m2.p0 = seed[1];
      state.matches.m2.p1 = seed[2];
    } else {
      state.matches.m1.p0 = null;
      state.matches.m1.p1 = null;
      state.matches.m2.p0 = null;
      state.matches.m2.p1 = null;
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
    } else if (state.matches.m5.win !== null) {
      podium[2] = loserOf(state.matches.m5);
      podium[3] = loserOf(state.matches.m3);
    }
    state.podium = podium;
    assignFunnyTitles(state);
  }

  function assignFunnyTitles(state) {
    const needed = [];
    for (let i = 1; i < 4; i++) {
      if (state.podium[i] !== null && !state.assignedTitles[state.podium[i]]) {
        needed.push(state.podium[i]);
      }
    }
    if (!needed.length) return;
    const pool = FUNNY_TITLES.slice().sort(() => Math.random() - 0.5);
    needed.forEach((pIdx, i) => {
      state.assignedTitles[pIdx] = pool[i % pool.length];
    });
  }

  function computePrizes(bank, step) {
    let s = Number(step);
    if (isNaN(s) || s <= 0) s = 1000;
    if (bank <= 0) return [0, 0, 0, 0];

    const total = Math.floor(bank / s) * s;
    if (total <= 0) return [0, 0, 0, 0];
    const units = total / s;

    if (units < 4) {
      const res = [0, 0, 0, 0];
      for (let i = 0; i < units && i < 4; i++) res[i] = s;
      return res;
    }

    let p4 = Math.max(1, Math.floor(units * 0.08));
    let p3 = Math.max(1, Math.floor(units * 0.17));
    let p2 = Math.max(1, Math.floor(units * 0.25));
    let p1 = units - p2 - p3 - p4;

    if (p1 < p2) {
      const diff = p2 - p1;
      p1 += diff;
      p2 = Math.max(1, p2 - diff);
      while (p1 + p2 + p3 + p4 > units) {
        if (p2 > 1) { p2--; p1++; }
        else if (p3 > 1) { p3--; p1++; }
        else if (p4 > 1) { p4--; p1++; }
        else break;
      }
    }
    return [p1 * s, p2 * s, p3 * s, p4 * s];
  }

  function computeBankAndPrizes(state) {
    let bank = 0;
    const lossList = [];
    const lossByPlayer = [0, 0, 0, 0];

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (state.matrix[r][c] === 0) {
          const bet = (state.groupBets[r][c] != null)
            ? state.groupBets[r][c]
            : (state.currentBet || 1000);
          bank += bet;
          lossByPlayer[r] += bet;
          lossList.push({
            loser: state.names[r],
            winner: state.names[c],
            bet
          });
        }
      }
    }

    Object.keys(state.matches).forEach(mKey => {
      const m = state.matches[mKey];
      if (m.win !== null && m.p0 !== null && m.p1 !== null) {
        const loserIdx = m.win === m.p0 ? m.p1 : m.p0;
        const bet2 = (state.matchBets[mKey] != null)
          ? state.matchBets[mKey]
          : (state.currentBet || 1000);
        bank += bet2;
        lossByPlayer[loserIdx] += bet2;
        lossList.push({
          loser: state.names[loserIdx],
          winner: state.names[m.win],
          bet: bet2
        });
      }
    });

    const prizes = computePrizes(bank, state.currentBet);
    const prizeByPlayer = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const p = state.podium[i];
      if (p !== null) prizeByPlayer[p] = prizes[i];
    }

    const financeByPlayer = [];
    for (let j = 0; j < 4; j++) {
      financeByPlayer[j] = {
        lost: lossByPlayer[j],
        won: prizeByPlayer[j],
        net: prizeByPlayer[j] - lossByPlayer[j]
      };
    }

    return { bank, lossList, lossByPlayer, prizeByPlayer, prizes, financeByPlayer };
  }

  function computeTotalScores(state) {
    const scores = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (state.matrix[r][c] === 1) scores[r]++;
      }
    }
    Object.keys(state.matches).forEach(mKey => {
      const m = state.matches[mKey];
      if (m.win !== null) scores[m.win]++;
    });
    return scores;
  }

  function recordGroupWin(state, r, c, bet) {
    if (r === c) return false;
    if (state.matrix[r][c] !== null || state.matrix[c][r] !== null) return false;
    state.matrix[r][c] = 1;
    state.matrix[c][r] = 0;
    state.groupBets[r][c] = bet;
    state.currentBet = bet;
    recalcBracket(state);
    return true;
  }

  function recordPlayoffWin(state, mKey, slotIdx, bet) {
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
    return state.matches.m6.win !== null;
  }

  function buildArchiveRecord(state) {
    const bp = computeBankAndPrizes(state);
    const scores = computeTotalScores(state);
    const medals = ['🥇', '🥈', '🥉', '4️⃣'];
    const players = [];

    for (let i = 0; i < 4; i++) {
      const pIdx = state.podium[i];
      if (pIdx === null) continue;
      const title = i === 0 ? '👑 Повелитель кия' : (state.assignedTitles[pIdx] || 'Мастер сукна');
      const f = bp.financeByPlayer[pIdx];
      players.push({
        place: i + 1,
        name: state.names[pIdx],
        title,
        wins: scores[pIdx],
        lost: f.lost,
        won: f.won,
        net: f.net
      });
    }

    return {
      id: 'T' + Date.now(),
      date: new Date().toISOString(),
      sport: 'billiard',
      format: 'group-de',
      bet: state.currentBet,
      bank: bp.bank,
      players
    };
  }

  function applyToPlayerStats(record) {
    record.players.forEach(p => {
      Storage.upsertPlayer(p.name);
      const cur = Storage.getPlayers()[p.name];
      const patch = {
        tournaments: (cur.tournaments || 0) + 1,
        totalWins: (cur.totalWins || 0) + (p.wins || 0),
        totalLosses: (cur.totalLosses || 0) + Math.max(0, 6 - (p.wins || 0)), // rough
        totalWon: (cur.totalWon || 0) + (p.won || 0),
        totalLost: (cur.totalLost || 0) + (p.lost || 0),
        net: (cur.net || 0) + (p.net || 0)
      };
      if (p.place === 1) patch.gold = (cur.gold || 0) + 1;
      if (p.place === 2) patch.silver = (cur.silver || 0) + 1;
      if (p.place === 3) patch.bronze = (cur.bronze || 0) + 1;
      Storage.updatePlayerStats(p.name, patch);
    });
  }

  return {
    createEmptyState,
    recalcBracket,
    computeBankAndPrizes,
    computeTotalScores,
    computeGroupScores,
    isGroupComplete,
    recordGroupWin,
    recordPlayoffWin,
    isFinished,
    buildArchiveRecord,
    applyToPlayerStats,
    shortName(n) {
      if (!n) return '?';
      return n.length > 8 ? n.slice(0, 7) + '…' : n;
    },
    pluralMatch(n) {
      const mod10 = n % 10, mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) return 'матч';
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'матча';
      return 'матчей';
    }
  };
})();
