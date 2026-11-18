const Api = (function () {
  const TIMEOUT_MS = 25000;
  const GET_LIMIT = 1800; // длинные запросы (состояние турнира, итоги) уходят POST-ом

  function base() {
    return String(window.LIGA_API_URL || '').trim().replace(/\/$/, '');
  }
  function enabled() {
    return /^https:\/\/script\.google\.com\//.test(base());
  }

  function parse(t) {
    try { return JSON.parse(t); }
    catch (e) { throw new Error('Bad API response'); }
  }

  function request(params) {
    if (!enabled()) return Promise.reject(new Error('API URL not set'));
    const q = new URLSearchParams();
    Object.keys(params).forEach(k => {
      const v = params[k];
      if (v === undefined) return;
      q.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    });
    const qs = q.toString();

    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
    const opts = { redirect: 'follow', cache: 'no-store' };
    if (ctl) opts.signal = ctl.signal;

    let p;
    if (qs.length > GET_LIMIT) {
      // text/plain — «простой» запрос без preflight, Apps Script читает тело из e.postData.contents
      p = fetch(base(), Object.assign({ method: 'POST', body: JSON.stringify(params) }, opts));
    } else {
      p = fetch(base() + '?' + qs, Object.assign({ method: 'GET' }, opts));
    }
    return p.then(r => r.text()).then(parse).finally(() => { if (timer) clearTimeout(timer); });
  }

  return {
    enabled,
    ping: () => request({ action: 'ping' }),

    // игроки и статистика
    getPlayers: () => request({ action: 'getPlayers' }).then(d => d.players || []),
    getStats: () => request({ action: 'getStats' }),
    upsertPlayer: (p) => request(Object.assign({ action: 'upsertPlayer' }, p)),
    ensureMe: (p) => request(Object.assign({ action: 'ensureMe' }, p)),

    // лобби / встречи
    createLobby: (o) => request(Object.assign({ action: 'createLobby' }, o)),
    getLobby: (id, since) => request({ action: 'getLobby', id: id, since: since === undefined ? '' : since }),
    getMyActive: (id) => request({ action: 'getMyActive', id: id }),
    joinLobby: (lobbyId, me) => request({ action: 'joinLobby', lobbyId: lobbyId, id: me.id, name: me.name, username: me.username || '' }),
    inviteById: (lobbyId, toId, toName) => request({ action: 'inviteById', lobbyId: lobbyId, toId: toId, toName: toName || '' }),
    removeFromLobby: (lobbyId, byId, id) => request({ action: 'removeFromLobby', lobbyId: lobbyId, byId: byId, id: id }),
    cancelLobby: (lobbyId, byId) => request({ action: 'cancelLobby', lobbyId: lobbyId, byId: byId }),
    startLobby: (payload) => request(Object.assign({ action: 'startLobby' }, payload)),
    setPair: (lobbyId, byId, a, b) => request({ action: 'setPair', lobbyId: lobbyId, byId: byId, a: a, b: b }),
    recordGame: (lobbyId, byId, gameNo, winner) => request({ action: 'recordGame', lobbyId: lobbyId, byId: byId, gameNo: gameNo, winner: winner }),
    undoGame: (lobbyId, byId) => request({ action: 'undoGame', lobbyId: lobbyId, byId: byId }),
    saveLobbyState: (lobbyId, byId, version, state) => request({ action: 'saveLobbyState', lobbyId: lobbyId, byId: byId, version: version, state: state }),
    finishLobby: (lobbyId, byId, record) => request({ action: 'finishLobby', lobbyId: lobbyId, byId: byId, record: record || null })
  };
})();
