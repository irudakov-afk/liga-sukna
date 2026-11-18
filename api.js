const Api = (function () {
  function base() {
    return String(window.LIGA_API_URL || '').trim().replace(/\/$/, '');
  }
  function enabled() {
    return /^https:\/\/script\.google\.com\//.test(base());
  }
  function request(params) {
    if (!enabled()) return Promise.reject(new Error('API URL not set'));
    const q = new URLSearchParams();
    Object.keys(params).forEach(k => {
      const v = params[k];
      q.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    });
    return fetch(base() + '?' + q.toString(), { method: 'GET', redirect: 'follow', cache: 'no-store' })
      .then(r => r.text())
      .then(t => {
        try { return JSON.parse(t); }
        catch (e) { throw new Error('Bad API response'); }
      });
  }
  return {
    enabled,
    ping: () => request({ action: 'ping' }),
    syncAll: () => request({ action: 'syncAll' }),
    getState: () => request({ action: 'getState' }).then(d => d.state || null),
    saveState: (state) => request({ action: 'saveState', state: state }),
    clearState: () => request({ action: 'clearState' }),
    getPlayers: () => request({ action: 'getPlayers' }).then(d => d.players || []),
    upsertPlayer: (p) => request(Object.assign({ action: 'upsertPlayer' }, p)),
    archiveTournament: (record) => request({ action: 'archiveTournament', record: record }),
    recordH2H: (payload) => request(Object.assign({ action: 'recordH2H' }, payload)),
    createLobby: (opts) => request(Object.assign({ action: 'createLobby' }, opts)),
    getLobby: (id) => request({ action: 'getLobby', id: id }).then(d => d.lobby),
    sendInvites: (lobbyId, usernames) => request({ action: 'sendInvites', lobbyId: lobbyId, usernames: usernames }),
    getPhoto: (telegramId) => request({ action: 'getPhoto', telegramId: telegramId }),
    inviteById: (lobbyId, toId, toName) => request({ action: 'inviteById', lobbyId: lobbyId, toId: toId, toName: toName || '' }),
    ensureMe: (p) => request(Object.assign({ action: 'ensureMe' }, p))
  };
})();
