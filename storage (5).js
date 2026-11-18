/**
 * Local + identity storage. Players keyed by telegramId when available, else by name.
 */
const Storage = (function () {
  const KEYS = {
    players: 'liga_players_v2',
    history: 'liga_history_v2',
    current: 'liga_current_v2',
    me: 'liga_me_v1'
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

  function playerKey(name, telegramId) {
    if (telegramId) return 'tg:' + String(telegramId);
    return 'name:' + String(name || '').trim().toLowerCase();
  }

  function getPlayers() {
    return load(KEYS.players, {});
  }

  function getPlayerByKey(key) {
    return getPlayers()[key] || null;
  }

  function upsertPlayer(name, telegramId) {
    if (!name || !String(name).trim()) return null;
    const n = String(name).trim();
    const key = playerKey(n, telegramId);
    const players = getPlayers();
    if (!players[key]) {
      players[key] = {
        key,
        name: n,
        telegramId: telegramId ? String(telegramId) : null,
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
    } else {
      players[key].name = n;
      if (telegramId) players[key].telegramId = String(telegramId);
    }
    save(KEYS.players, players);
    return players[key];
  }

  function updatePlayerStats(key, patch) {
    const players = getPlayers();
    if (!players[key]) {
      if (patch.name) upsertPlayer(patch.name, patch.telegramId);
    }
    const cur = players[key] || getPlayers()[key];
    if (!cur) return;
    Object.assign(cur, patch);
    cur.lastPlayed = new Date().toISOString();
    players[key] = cur;
    save(KEYS.players, players);
  }

  function getPlayerList() {
    const players = getPlayers();
    return Object.values(players).sort((a, b) => {
      if ((b.gold || 0) !== (a.gold || 0)) return (b.gold || 0) - (a.gold || 0);
      if ((b.net || 0) !== (a.net || 0)) return (b.net || 0) - (a.net || 0);
      return String(a.name).localeCompare(String(b.name));
    });
  }

  function findByTelegramId(tgId) {
    if (!tgId) return null;
    const id = String(tgId);
    const players = getPlayers();
    for (const p of Object.values(players)) {
      if (p.telegramId && String(p.telegramId) === id) return p;
    }
    return null;
  }

  function getHistory() {
    return load(KEYS.history, []);
  }

  function addTournament(record) {
    const hist = getHistory();
    hist.unshift(record);
    if (hist.length > 50) hist.length = 50;
    save(KEYS.history, hist);
  }

  function getCurrent() {
    return load(KEYS.current, null);
  }

  function setCurrent(state) {
    save(KEYS.current, state);
  }

  function clearCurrent() {
    localStorage.removeItem(KEYS.current);
  }

  function getMe() {
    return load(KEYS.me, null);
  }

  function setMe(user) {
    save(KEYS.me, user);
  }

  return {
    playerKey,
    getPlayers,
    getPlayerByKey,
    upsertPlayer,
    updatePlayerStats,
    getPlayerList,
    findByTelegramId,
    getHistory,
    addTournament,
    getCurrent,
    setCurrent,
    clearCurrent,
    getMe,
    setMe
  };
})();
