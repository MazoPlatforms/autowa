(() => {
  const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
  fetch('/api/catalog-status', { credentials: 'same-origin', cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(data => {
      set('website-status', data.state === 'ready' ? 'Healthy' : (data.state || 'Unknown'));
      set('anime-status', data.anime?.state === 'ready' ? 'Healthy' : (data.anime?.state || 'Unknown'));
      const timestamp = Number(data.anime?.updated_at || data.updated_at || 0);
      set('refresh-time', timestamp ? new Date(timestamp).toLocaleString() : 'Not available');
    })
    .catch(() => { set('website-status', 'Unavailable'); set('anime-status', 'Unavailable'); set('refresh-time', 'Not available'); });
})();
