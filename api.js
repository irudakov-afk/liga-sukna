/**
 * Облако через Google Apps Script.
 * Запись идёт GET-запросом (надёжнее с CORS, чем POST).
 */
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
    const url = base() + '?' + q.toString();
    return fetch(url, { method: 'GET', redirect: 'follow', cache: 'no-store' })
      .then(r => r.text())
      .then(t => {
        try { return JSON.parse(t); }
        catch (e) { throw new Error('Bad API response'); }
      });
  }

  return {
    enabled,
    ping: () => request({ action: 'ping' }),
    getState: () => request({ action: 'getState' }).then(d => d.state || null),
    saveState: (state) => request({ action: 'saveState', state: state }),
    clearState: () => request({ action: 'clearState' }),
    getPlayers: () => request({ action: 'getPlayers' }).then(d => d.players || []),
    upsertPlayer: (p) => request(Object.assign({ action: 'upsertPlayer' }, p)),
    archiveTournament: (record) => request({ action: 'archiveTournament', record: record }),
    getHistory: () => request({ action: 'getHistory' }).then(d => d.history || []),
    recordH2H: (payload) => request(Object.assign({ action: 'recordH2H' }, payload))
  };
})();
