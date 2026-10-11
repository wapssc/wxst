// Playback lists are scoped to one browser tab and one source/video identity.
(() => {
    const key = 'libretvEpisodeContextV1';
    function write({source, id, episodes, episodeNames = []}) {
        if (!Array.isArray(episodes) || !episodes.length) return;
        sessionStorage.setItem(key, JSON.stringify({source: String(source || ''), id: String(id || ''), episodes, episodeNames, savedAt: Date.now()}));
    }
    function read({source, id, url}) {
        try {
            const data = JSON.parse(sessionStorage.getItem(key) || 'null');
            if (!data || data.source !== String(source || '') || data.id !== String(id || '') || !Array.isArray(data.episodes)) return null;
            if (url && !data.episodes.includes(url)) return null;
            return data;
        } catch { return null; }
    }
    window.EpisodeContext = {read, write};
})();
