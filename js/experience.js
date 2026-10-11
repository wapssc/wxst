// Shared, local-only data for search grouping, resume and source preference.
(() => {
    const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
    const identity = item => window.QuickPlay.logic.identity(item);
    const year = value => String(value || '').match(/(?:19|20)\d{2}/)?.[0] || '';
    function groupResults(items) {
        const groups = new Map();
        for (const item of items) {
            const info = identity(item);
            // Missing identity fields cannot safely merge distinct versions.
            const key = info.title && info.year && info.kind
                ? [normalize(info.title), info.year, info.kind].join('|')
                : `${item.source_code || ''}:${item.vod_id || ''}`;
            if (!groups.has(key)) groups.set(key, []);
            const group = groups.get(key);
            if (!group.some(entry => entry.source_code === item.source_code && String(entry.vod_id) === String(item.vod_id))) group.push(item);
        }
        return [...groups.values()];
    }
    function unfinishedHistory(records) {
        return (Array.isArray(records) ? records : []).filter(item =>
            item?.title && item?.url && Number(item.playbackPosition) > 10 &&
            (!Number(item.duration) || Number(item.playbackPosition) < Number(item.duration) * 0.95)
        ).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
    const watchLaterKey = 'watchLaterV1';
    function watchLater() {
        try { const list = JSON.parse(localStorage.getItem(watchLaterKey) || '[]'); return Array.isArray(list) ? list : []; }
        catch { return []; }
    }
    function laterKey(item) { return [normalize(item.title), item.year || '', item.kind || ''].join('|'); }
    function addWatchLater(item) {
        if (!item?.title) return;
        const list = watchLater().filter(entry => laterKey(entry) !== laterKey(item));
        list.unshift({title:String(item.title), year:year(item.year), kind:item.kind || '', source:item.source || '', id:item.id || ''});
        localStorage.setItem(watchLaterKey, JSON.stringify(list.slice(0, 50)));
    }
    function removeWatchLater(item) { localStorage.setItem(watchLaterKey, JSON.stringify(watchLater().filter(entry => laterKey(entry) !== laterKey(item)))); }
    const qualityKey = 'sourcePlaybackQualityV1';
    function qualityData() { try { return JSON.parse(localStorage.getItem(qualityKey) || '{}'); } catch { return {}; } }
    function recordQuality(source, { started = false, firstFrameMs = 0, stalls = 0 } = {}) {
        if (!source) return;
        const data = qualityData();
        const observations = Array.isArray(data[source]) ? data[source] : [];
        observations.push({ at: Date.now(), started: Boolean(started), firstFrameMs: Math.max(0, Number(firstFrameMs) || 0), stalls: Math.max(0, Number(stalls) || 0) });
        data[source] = observations.slice(-12);
        localStorage.setItem(qualityKey, JSON.stringify(data));
    }
    function recordStall(source) {
        const data = qualityData();
        const list = data[source];
        if (!Array.isArray(list) || !list.length) return;
        const last = list[list.length - 1];
        if (!last.started || Date.now() - last.at > 3600000) return;
        last.stalls = (last.stalls || 0) + 1;
        localStorage.setItem(qualityKey, JSON.stringify(data));
    }
    function qualityScore(source, now = Date.now()) {
        const observations = (qualityData()[source] || []).filter(item => now - item.at < 14 * 86400000);
        if (!observations.length) return 0;
        const recent = observations.slice(-6);
        return recent.reduce((sum, item, index) => {
            const weight = (index + 1) / recent.length;
            return sum + weight * (item.started ? 10 - Math.min(item.firstFrameMs / 1000, 8) - Math.min(item.stalls * 2, 6) : -12);
        }, 0);
    }
    function matchingRecord(record, item) {
        const info = identity(item);
        if (normalize(record.title) !== normalize(info.title)) return false;
        if (record.sourceName === item.source_code && String(record.vod_id) === String(item.vod_id)) return true;
        return Boolean(record.movieYear && record.movieKind && record.movieYear === info.year && record.movieKind === info.kind);
    }
    function chooseCandidate(items, request, records = []) {
        const valid = items.filter(item => window.QuickPlay.logic.matches(item, request));
        const history = unfinishedHistory(records).find(record => valid.some(item => matchingRecord(record, item)));
        return [...valid].sort((a, b) => {
            const historyA = history && matchingRecord(history, a) && history.sourceName === a.source_code && String(history.vod_id) === String(a.vod_id) ? 1000 : 0;
            const historyB = history && matchingRecord(history, b) && history.sourceName === b.source_code && String(history.vod_id) === String(b.vod_id) ? 1000 : 0;
            return (historyB + qualityScore(b.source_code)) - (historyA + qualityScore(a.source_code));
        })[0] || null;
    }
    window.LibreExperience = { groupResults, unfinishedHistory, watchLater, addWatchLater, removeWatchLater, recordQuality, recordStall, qualityScore, chooseCandidate, year };
})();
