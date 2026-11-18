/**
 * Local persistence for players, history and current tournament.
 * Everything stays on device — no server required.
 */
const Storage = (function () {
  const KEYS = {
    players: 'liga_players_v1',
    history: 'liga_history_v1',
    current: 'liga_current_v1'
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Storage save failed', e);
    }
  }

  // ---------- Players ----------
  function getPlayers() {
    return load(KEYS.players, {});
  }

  function upsertPlayer(name) {
    if (!name || !name.trim()) return;
    const n = name.trim();
    const players = getPlayers();
    if (!players[n]) {
      players[n] = {
        name: n,
        tournaments: 0,
        gold: 0,
        silver: 0,
        bronze: 0,
        totalWins: 0,
        totalLosses: 0,
        totalWon: 0,
        totalLost: 0,
        net: 0,
        lastPlayed: null
      };
      save(KEYS.players, players);
    }
    return players[n];
  }

  function updatePlayerStats(name, patch) {
    const players = getPlayers();
    if (!players[name]) upsertPlayer(name);
    Object.assign(players[name], patch);
    players[name].lastPlayed = new Date().toISOString();
    save(KEYS.players, players);
  }

  function getPlayerList() {
    const players = getPlayers();
    return Object.values(players).sort((a, b) => {
      if (b.gold !== a.gold) return b.gold - a.gold;
      if (b.net !== a.net) return b.net - a.net;
      return a.name.localeCompare(b.name);
    });
  }

  // ---------- History ----------
  function getHistory() {
    return load(KEYS.history, []);
  }

  function addTournament(record) {
    const hist = getHistory();
    hist.unshift(record);
    // keep last 50
    if (hist.length > 50) hist.length = 50;
    save(KEYS.history, hist);
  }

  // ---------- Current tournament ----------
  function getCurrent() {
    return load(KEYS.current, null);
  }

  function setCurrent(state) {
    save(KEYS.current, state);
  }

  function clearCurrent() {
    localStorage.removeItem(KEYS.current);
  }

  return {
    getPlayers,
    upsertPlayer,
    updatePlayerStats,
    getPlayerList,
    getHistory,
    addTournament,
    getCurrent,
    setCurrent,
    clearCurrent
  };
})();
