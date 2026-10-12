// Optional discovery content below playback. None of these requests block video startup.
(() => {
    let activeKey = '';
    let activeRequest = null;
    const text = value => String(value ?? '').trim();

    function card(item, kind) {
        const title = text(item.vod_name || item.title);
        const year = window.LibreExperience.year(item.vod_year || item.year);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'player-recommendation-card';
        button.setAttribute('aria-label', `播放${title}${year ? `，${year}年` : ''}`);
        const image = document.createElement('img');
        const sourceUrl = item.api_url || window.API_SITES?.[item.source_code]?.api || '';
        const cover = window.normalizeImageUrl(item.vod_pic || item.cover, sourceUrl);
        image.src = cover || window.createImagePlaceholder(title);
        image.loading = 'lazy';
        image.alt = '';
        image.referrerPolicy = 'no-referrer';
        image.onerror = () => window.setImagePlaceholder(image, title);
        const name = document.createElement('strong');
        name.textContent = title;
        const caption = document.createElement('small');
        caption.textContent = [year, item.source_name || (item.source_code ? window.API_SITES?.[item.source_code]?.name : '热门推荐')].filter(Boolean).join(' · ');
        button.append(image, name, caption);
        button.onclick = () => window.QuickPlay.open({title, year, kind, source:item.source_code || '', id:item.vod_id || ''});
        return button;
    }

    function renderCards(target, items, kind) {
        target.replaceChildren(...items.map(item => card(item, kind)));
    }

    function renderSynopsis(info, fallbackTitle, source) {
        const target = document.getElementById('playerSynopsis');
        if (!target) return;
        target.replaceChildren();
        const layout = document.createElement('div');
        layout.className = 'player-synopsis-layout';
        if (info.cover) {
            const cover = document.createElement('img');
            cover.className = 'player-synopsis-cover';
            cover.alt = '';
            cover.src = window.normalizeImageUrl(info.cover, window.API_SITES?.[source]?.api || '') || window.createImagePlaceholder(fallbackTitle);
            cover.onerror = () => window.setImagePlaceholder(cover, fallbackTitle);
            layout.appendChild(cover);
        }
        const copy = document.createElement('div');
        copy.className = 'player-synopsis-copy';
        const heading = document.createElement('strong');
        heading.textContent = text(info.title) || fallbackTitle;
        copy.appendChild(heading);
        const metadata = document.createElement('div');
        metadata.className = 'player-synopsis-meta';
        for (const value of [info.year, info.type, info.area, info.remarks, info.source_name]) {
            if (!text(value)) continue;
            const badge = document.createElement('span');
            badge.textContent = text(value);
            metadata.appendChild(badge);
        }
        copy.appendChild(metadata);
        for (const [label, value] of [['导演', info.director], ['主演', info.actor]]) {
            if (!text(value)) continue;
            const line = document.createElement('p');
            line.textContent = `${label}：${text(value)}`;
            copy.appendChild(line);
        }
        const description = document.createElement('p');
        description.className = 'player-synopsis-description';
        const plain = new DOMParser().parseFromString(text(info.desc), 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() || '';
        description.textContent = plain || '暂无简介';
        copy.appendChild(description);
        if (plain.length > 220) {
            const expand = document.createElement('button');
            expand.type = 'button';
            expand.className = 'player-synopsis-expand';
            expand.textContent = '展开简介';
            expand.onclick = () => {
                const expanded = description.classList.toggle('expanded');
                expand.textContent = expanded ? '收起简介' : '展开简介';
                expand.setAttribute('aria-expanded', String(expanded));
            };
            expand.setAttribute('aria-expanded', 'false');
            copy.appendChild(expand);
        }
        layout.appendChild(copy);
        target.appendChild(layout);
    }

    function selectedSources(source) {
        let chosen;
        try { chosen = JSON.parse(localStorage.getItem('selectedAPIs') || 'null'); } catch { chosen = null; }
        const ids = [source, ...(Array.isArray(chosen) ? chosen : window.DEFAULT_SELECTED_APIS || [])];
        const filtered = localStorage.getItem('yellowFilterEnabled') === 'true';
        return [...new Set(ids.filter(Boolean))].filter(id => {
            const context = window.getApiSearchContext(id);
            const isAdult = window.API_SITES?.[id]?.adult ||
                (id.startsWith('custom_') && window.getCustomApiInfo?.(id.slice(7))?.isAdult);
            return context && (!filtered || !isAdult);
        }).slice(0, 5);
    }

    async function firstPage(source, query, signal, category = false) {
        const context = window.getApiSearchContext(source);
        if (!context) return [];
        const path = category
            ? `?ac=videolist&t=${encodeURIComponent(query)}&pg=1`
            : API_CONFIG.search.path + encodeURIComponent(query);
        const data = await window.fetchVodApiJson(context.apiBaseUrl + path, API_CONFIG.search.headers, signal);
        return window.normalizeApiList(data, source, context);
    }

    async function findFranchise(current, source, signal) {
        const root = window.LibreExperience.seriesStem(current.title, current.kind);
        if (root.length < 2 || !['movie', 'tv'].includes(current.kind)) return [];
        const pages = await Promise.allSettled(selectedSources(source).map(id => firstPage(id, root, signal)));
        const items = pages.flatMap(page => page.status === 'fulfilled' ? page.value : []);
        return window.LibreExperience.franchiseRecommendations(items, current).slice(0, 8);
    }

    function doubanTag(info, kind) {
        const genres = text(info.className || info.type);
        const options = kind === 'tv'
            ? ['国产剧','美剧','英剧','韩剧','日剧','港剧','日本动画','综艺','纪录片']
            : ['动作','喜剧','爱情','科幻','悬疑','恐怖','动画','纪录片','剧情'];
        return options.find(tag => genres.includes(tag)) || '热门';
    }

    async function doubanPopular(current, info, signal) {
        if (!['movie', 'tv'].includes(current.kind)) return [];
        const tag = doubanTag(info, current.kind);
        const url = `https://movie.douban.com/j/search_subjects?type=${current.kind}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=24&page_start=0`;
        const data = await window.fetchVodApiJson(url, API_CONFIG.search.headers, signal);
        return (Array.isArray(data?.subjects) ? data.subjects : []).map(item => ({
            vod_name:item.title, vod_year:item.year, vod_pic:item.cover, vod_score:item.rate,
            type_name:current.type || current.kind, source_name:'豆瓣热门'
        }));
    }

    async function findRelated(current, info, source, signal, onPartial) {
        const collected = [];
        const add = items => {
            collected.push(...items);
            const ranked = window.LibreExperience.relatedRecommendations(collected, current).slice(0, 16);
            if (ranked.length) onPartial(ranked);
        };
        const tasks = [doubanPopular(current, info, signal).then(add)];
        if (info.categoryId && source && selectedSources(source).includes(source)) {
            tasks.push(firstPage(source, info.categoryId, signal, true).then(add));
        }
        await Promise.allSettled(tasks);
        return window.LibreExperience.relatedRecommendations(collected, current).slice(0, 16);
    }

    function renderUnavailable(target, message, retry) {
        target.replaceChildren();
        const note = document.createElement('p');
        note.textContent = message;
        target.appendChild(note);
        if (retry) {
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'player-recommendation-retry'; button.textContent = '重试推荐';
            button.onclick = retry;
            target.appendChild(button);
        }
    }

    async function load(force = false) {
        const params = new URLSearchParams(location.search);
        const title = text(params.get('title'));
        const source = text(params.get('source'));
        const id = text(params.get('id'));
        const key = [title, source, id, params.get('year'), params.get('kind')].join('|');
        if (!force && key === activeKey && activeRequest) return activeRequest;
        activeKey = key;
        const signal = AbortSignal.timeout(10000);
        const relatedTarget = document.getElementById('relatedRecommendations');
        const franchiseSection = document.getElementById('franchiseSection');
        const franchiseTarget = document.getElementById('franchiseRecommendations');
        if (!relatedTarget || !franchiseSection || !franchiseTarget) return;
        renderSynopsis({}, title || '当前视频', source);
        relatedTarget.textContent = '正在查找同类型作品…';
        franchiseSection.hidden = true;
        activeRequest = (async () => {
            let detail = window.QuickPlay?.currentDetail?.();
            if (!detail && source && id) {
                try {
                    const response = await fetch(`/api/detail?id=${encodeURIComponent(id)}${window.getDetailApiParamsForSource(source)}`, {signal});
                    if (response.ok) detail = await response.json();
                } catch { /* Direct links still show title and broad recommendations. */ }
            }
            const info = detail?.videoInfo || {};
            renderSynopsis(info, title || '当前视频', source);
            const inferred = window.QuickPlay.logic.identity({vod_name:title, vod_year:info.year, type_name:info.type});
            const current = {
                title:title || info.title || '', year:params.get('year') || info.year || '',
                kind:params.get('kind') || inferred.kind, type:info.type || '', categoryId:info.categoryId || ''
            };
            const franchise = findFranchise(current, source, signal).then(items => {
                if (activeKey !== key) return;
                franchiseSection.hidden = !items.length;
                if (items.length) renderCards(franchiseTarget, items, current.kind);
            }).catch(() => { franchiseSection.hidden = true; });
            const related = findRelated(current, info, source, signal, items => {
                if (activeKey === key) renderCards(relatedTarget, items, current.kind);
            }).then(items => {
                if (activeKey !== key) return;
                if (items.length) renderCards(relatedTarget, items, current.kind);
                else renderUnavailable(relatedTarget, '暂无同类型推荐', () => load(true));
            }).catch(() => { if (activeKey === key) renderUnavailable(relatedTarget, '推荐暂时无法加载', () => load(true)); });
            await Promise.allSettled([franchise, related]);
        })();
        return activeRequest;
    }

    window.PlayerRecommendations = {load};
})();
