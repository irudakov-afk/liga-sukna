const Storage = (function () {
  const KEYS = {
    players: 'liga_players_v3',
    h2h: 'liga_h2h_v1',
    current: 'liga_current_v3',
    me: 'liga_me_v1',
    history: 'liga_history_v3'
  };
  function load(k, fb) {
    try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; }
    catch (e) { return fb; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  function playerKey(name, telegramId) {
    if (telegramId) return 'tg:' + String(telegramId);
    return 'name:' + String(name || '').trim().toLowerCase();
  }
  function getPlayers() { return load(KEYS.players, {}); }
  function getPlayerByKey(key) { return getPlayers()[key] || null; }
  function upsertPlayer(name, telegramId) {
    if (!name || !String(name).trim()) return null;
    const n = String(name).trim();
    const key = playerKey(n, telegramId);
    const players = getPlayers();
    if (!players[key]) {
      players[key] = {
        key, name: n, telegramId: telegramId ? String(telegramId) : null,
        tournaments: 0, gold: 0, silver: 0, bronze: 0,
        totalWins: 0, totalLosses: 0, totalWon: 0, totalLost: 0, net: 0,
        h2hWins: 0, h2hLosses: 0, lastPlayed: null
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
    if (!players[key] && patch.name) upsertPlayer(patch.name, patch.telegramId);
    const cur = getPlayers()[key];
    if (!cur) return;
    Object.assign(cur, patch);
    cur.lastPlayed = new Date().toISOString();
    players[key] = cur;
    save(KEYS.players, players);
  }
  function getPlayerList() {
    return Object.values(getPlayers()).sort((a, b) =>
      (b.gold || 0) - (a.gold || 0) || (b.net || 0) - (a.net || 0) ||
      String(a.name).localeCompare(String(b.name))
    );
  }
  function getH2H() { return load(KEYS.h2h, []); }
  function addH2H(rec) {
    const list = getH2H();
    list.unshift(rec);
    if (list.length > 200) list.length = 200;
    save(KEYS.h2h, list);
  }
  /** pair key independent of order */
  function pairKey(idA, idB) {
    const a = String(idA || '');
    const b = String(idB || '');
    return a < b ? a + '|' + b : b + '|' + a;
  }
  function h2hStats(idA, idB) {
    const list = getH2H();
    let aWins = 0, bWins = 0, meetings = 0;
    list.forEach(m => {
      const ids = [String(m.p1Id || ''), String(m.p2Id || '')];
      if (ids.indexOf(String(idA)) < 0 || ids.indexOf(String(idB)) < 0) return;
      meetings++;
      if (String(m.winnerId) === String(idA)) aWins++;
      if (String(m.winnerId) === String(idB)) bWins++;
    });
    return { meetings, aWins, bWins };
  }
  return {
    playerKey, getPlayers, getPlayerByKey, upsertPlayer, updatePlayerStats,
    getPlayerList, getH2H, addH2H, pairKey, h2hStats,
    getCurrent: () => load(KEYS.current, null),
    setCurrent: (s) => save(KEYS.current, s),
    clearCurrent: () => localStorage.removeItem(KEYS.current),
    getHistory: () => load(KEYS.history, []),
    addTournament: (r) => { const h = load(KEYS.history, []); h.unshift(r); if (h.length > 50) h.length = 50; save(KEYS.history, h); },
    getMe: () => load(KEYS.me, null),
    setMe: (u) => save(KEYS.me, u)
  };
})();
