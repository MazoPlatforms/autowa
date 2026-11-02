(() => {
  const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
  fetch('/api/catalog-status', { credentials: 'same-origin', cache: 'no-store' })
    .then(response => response.ok ? response.json() : Promise.reject())
    .then(data => {
      const website = document.getElementById('website-status');
      const anime = document.getElementById('anime-status');
      const websiteState = data.state === 'ready' ? 'ready' : (data.state || 'unknown');
      const animeState = data.anime?.state === 'ready' ? 'ready' : (data.anime?.state || 'unknown');
      set('website-status', websiteState === 'ready' ? 'Healthy' : websiteState);
      set('anime-status', animeState === 'ready' ? 'Healthy' : animeState);
      if (website) website.dataset.state = websiteState;
      if (anime) anime.dataset.state = animeState;
      const timestamp = Number(data.anime?.updated_at || data.updated_at || 0);
      set('refresh-time', timestamp ? new Date(timestamp).toLocaleString() : 'Not available');
    })
    .catch(() => { set('website-status', 'Unavailable'); set('anime-status', 'Unavailable'); set('refresh-time', 'Not available'); });
})();
