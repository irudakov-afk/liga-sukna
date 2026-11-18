/**
 * Cloud API → Google Apps Script web app
 */
const Api = (function () {
  function base() {
    return (window.LIGA_API_URL || '').replace(/\/$/, '');
  }

  function enabled() {
    return !!base();
  }

  function get(action, params) {
    if (!enabled()) return Promise.reject(new Error('API URL not set'));
    const q = new URLSearchParams(Object.assign({ action: action }, params || {}));
    return fetch(base() + '?' + q.toString(), { method: 'GET' })
      .then(r => r.json());
  }

  function post(payload) {
    if (!enabled()) return Promise.reject(new Error('API URL not set'));
    // Apps Script often needs text/plain to avoid CORS preflight issues
    return fetch(base(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(r => r.json());
  }

  function getState() {
    return get('getState').then(d => d.state || null);
  }

  function saveState(state) {
    return post({ action: 'saveState', state: state });
  }

  function clearState() {
    return post({ action: 'clearState' });
  }

  function getPlayers() {
    return get('getPlayers').then(d => d.players || []);
  }

  function upsertPlayer(p) {
    return post(Object.assign({ action: 'upsertPlayer' }, p));
  }

  function archiveTournament(record) {
    return post({ action: 'archiveTournament', record: record });
  }

  function getHistory() {
    return get('getHistory').then(d => d.history || []);
  }

  return {
    enabled, getState, saveState, clearState,
    getPlayers, upsertPlayer, archiveTournament, getHistory
  };
})();
