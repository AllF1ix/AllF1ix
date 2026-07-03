const BASE_URL = "https://api.themoviedb.org/3";
const IMG_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_URL = "https://image.tmdb.org/t/p/original";

// 🔐 ANG IYONG LIVE ACCESS TOKEN MULA SA TMDB
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3NGNiYzA3NTJlMGEzNmZkYWM2NjU3YmIyMDZmMGJlYyIsIm5iZiI6MTc4Mjk0Nzk2NS43MTEsInN1YiI6IjZhNDVhMDdkZWI1NWZjYzQ2YjQ5ZTM5MyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.ilS0nk-zuZzmHq75FG6rk-1y-bcua8J6aAUC-ddcnvc";

// 🍿 DITO MO ILALAGAY ANG MGA SARILI MONG STREAMING LINKS BASI SA TMDB ID
const akingMgaStreamingLinks = {
    "23156": "https://iyong-server.com", // Halimbawa (ID ng Naruto)
    "550": "https://iyong-server.com"
};

// Ilang items lang ipapakita sa grid (2 rows x 6 columns = 12)
const MAX_GRID_ITEMS = 12;

// Para sa Movies / TV Shows & Anime catalog: 50 pages x 20 items = 1000 items
const CATALOG_PAGES = 50;
const MAX_CATALOG_ITEMS = 1000;

let currentSelectedShow = { id: "", type: "", youtubeKey: "" };
let currentCategory = "trending";
let lastSearchQuery = "";

// Naka-save na wika mula sa localStorage (kung meron), default "en" kung wala pa
const LANG_STORAGE_KEY = "allflix_lang";
let currentLanguage = localStorage.getItem(LANG_STORAGE_KEY) || "en";

// Naka-save na dark/light mode mula sa localStorage (kung meron), default "dark" kung wala pa
const MODE_STORAGE_KEY = "allflix_mode";
let currentMode = localStorage.getItem(MODE_STORAGE_KEY) || "dark";

// TMDB language codes per site language
const tmdbLanguageMap = {
    en: "en-US", tl: "tl-PH", ja: "ja-JP", ko: "ko-KR", zh: "zh-CN", es: "es-ES", fr: "fr-FR", id: "id-ID",
    ar: "ar-SA", hi: "hi-IN", pt: "pt-PT", de: "de-DE", it: "it-IT", ru: "ru-RU", vi: "vi-VN", th: "th-TH",
    tr: "tr-TR", nl: "nl-NL", pl: "pl-PL", sv: "sv-SE", no: "no-NO", da: "da-DK", fi: "fi-FI", el: "el-GR",
    he: "he-IL", uk: "uk-UA", cs: "cs-CZ", hu: "hu-HU", ro: "ro-RO", bn: "bn-BD", ur: "ur-PK", ms: "ms-MY",
    sw: "sw-KE", fa: "fa-IR", pa: "pa-IN", ta: "ta-IN", my: "my-MM", km: "km-KH"
};

function tmdbLang() {
    return tmdbLanguageMap[currentLanguage] || "en-US";
}

const rtlLanguages = ["ar", "he", "ur", "fa"];

// ===================== AUTO-TRANSLATE =====================
const TRANSLATE_CACHE_KEY = "allflix_translation_cache";
let translationCache = {};
try {
    translationCache = JSON.parse(localStorage.getItem(TRANSLATE_CACHE_KEY)) || {};
} catch (e) {
    translationCache = {};
}

function saveTranslationCache() {
    try {
        localStorage.setItem(TRANSLATE_CACHE_KEY, JSON.stringify(translationCache));
    } catch (e) {
        translationCache = {};
    }
}

const translateQueue = [];
const TRANSLATE_CONCURRENCY = 8;
let translateActiveWorkers = 0;

function queueTranslate(text, sourceLang, targetLang, onDone) {
    translateQueue.push({ text, sourceLang, targetLang, onDone });
    fillTranslateWorkers();
}

function fillTranslateWorkers() {
    while (translateActiveWorkers < TRANSLATE_CONCURRENCY && translateQueue.length > 0) {
        const job = translateQueue.shift();
        translateActiveWorkers++;

        translateText(job.text, job.sourceLang, job.targetLang)
            .then(result => job.onDone(result))
            .catch(() => job.onDone(job.text))
            .finally(() => {
                translateActiveWorkers--;
                fillTranslateWorkers();
            });
    }
}

async function translateText(text, sourceLang, targetLang) {
    if (!text || !sourceLang || !targetLang || sourceLang === targetLang) return text;

    const cacheKey = `${sourceLang}|${targetLang}|${text}`;
    if (translationCache[cacheKey]) return translationCache[cacheKey];

    let result;
    if (text.length > 480) {
        const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
        const chunks = [];
        let current = "";
        sentences.forEach(sentence => {
            if ((current + sentence).length > 480) {
                if (current) chunks.push(current);
                current = sentence;
            } else {
                current += sentence;
            }
        });
        if (current) chunks.push(current);

        const translatedChunks = [];
        for (const chunk of chunks) {
            translatedChunks.push(await translateSingleChunk(chunk, sourceLang, targetLang));
        }
        result = translatedChunks.join(" ");
    } else {
        result = await translateSingleChunk(text, sourceLang, targetLang);
    }

    translationCache[cacheKey] = result;
    saveTranslationCache();
    return result;
}

async function translateSingleChunk(text, sourceLang, targetLang) {
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
        const res = await fetch(url);
        const data = await res.json();
        const translated = data && data.responseData && data.responseData.translatedText;
        if (translated && translated.trim() && !/^PLEASE SELECT/i.test(translated)) {
            return translated;
        }
    } catch (e) {
        console.error("Auto-translate error:", e);
    }
    return text;
}

function needsAutoTranslate(displayTitle, originalTitle, originalLanguage) {
    if (currentLanguage === "en") return false;
    if (!originalLanguage || originalLanguage === currentLanguage) return false;
    if (!displayTitle || !originalTitle) return false;
    return displayTitle.trim().toLowerCase() === originalTitle.trim().toLowerCase();
}

// ===================== ON LOAD =====================
window.onload = function() {
    applyModeOnLoad();
    syncLanguageUI();
    applyLanguage();
    loadTrending();

    window.addEventListener('popstate', function(event) {
        if (event.state && event.state.id) {
            fetchFullDetails(event.state.id, event.state.type || 'movie', true);
        } else {
            closeDetail();
        }
    });
};

function loadTrending() {
    document.getElementById("detailView").style.display = "none";
    document.querySelector(".media-container").style.display = "block";
    currentCategory = "trending";
    const url = `${BASE_URL}/trending/all/day?language=${tmdbLang()}`;
    document.getElementById("section-title").innerText = t("section_trending");

    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
    const trendingBtn = document.querySelector(".nav-btn");
    if (trendingBtn) trendingBtn.classList.add("active");

    document.getElementById("hero-banner").style.display = "flex";
    document.body.classList.remove("no-hero");

    fetchData(url, (data) => {
        if (data && data.results && data.results.length > 0) {
            renderGrid(data.results);
            const firstItem = data.results[0];
            const type = firstItem.media_type || (firstItem.first_air_date ? 'tv' : 'movie');
            fetchFullDetails(firstItem.id, type);
        }
    });
}

function fetchData(url, callback) {
    fetch(url, {
        method: 'GET',
        headers: {
            accept: 'application/json',
            Authorization: `Bearer ${ACCESS_TOKEN}`
        }
    })
    .then(res => {
        if (!res.ok) throw new Error("HTTP error " + res.status);
        return res.json();
    })
    .then(data => callback(data))
    .catch(err => {
        console.error("Error loading data from TMDB:", err);
        document.getElementById("banner-title").innerText = "Connection Error";
        document.getElementById("banner-desc").innerText = "Hindi makakonekta nang ligtas sa TMDB server. Pakisuri ang token.";
    });
}

function renderGrid(items, limit = MAX_GRID_ITEMS, showNumbers = true) {
    const grid = document.getElementById("media-grid-items");
    const limitedItems = items.filter(item => item.poster_path).slice(0, limit);

    const htmlParts = limitedItems.map((item, index) => {
        const title = item.title || item.name;
        const originalTitle = item.original_title || item.original_name || title;
        const safeTitle = title ? title.replace(/"/g, "&quot;") : "";
        const safeOriginalTitle = originalTitle ? originalTitle.replace(/"/g, "&quot;") : "";
        const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        const number = index + 1;

        const willTranslate = needsAutoTranslate(title, originalTitle, item.original_language);

        return `
            <div class="card" onclick="fetchFullDetails('${item.id}', '${type}', true)" data-orig-title="${safeOriginalTitle}" data-orig-lang="${item.original_language || ''}">
                ${showNumbers ? `<span class="card-number">${number}</span>` : ""}
                <img src="${IMG_URL + item.poster_path}" alt="${safeTitle}" loading="lazy">
                <div class="card-details">
                    <div class="card-title${willTranslate ? " translating" : ""}">${title}</div>
                </div>
            </div>
        `;
    });

    grid.innerHTML = htmlParts.join("");
    observeCardsForTranslation();
}

let cardTranslateObserver = null;
function observeCardsForTranslation() {
    if (cardTranslateObserver) cardTranslateObserver.disconnect();

    cardTranslateObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const card = entry.target;
            cardTranslateObserver.unobserve(card);

            const titleEl = card.querySelector(".card-title");
            if (!titleEl) return;

            const displayedTitle = titleEl.innerText;
            const originalTitle = card.dataset.origTitle;
            const originalLang = card.dataset.origLang;

            if (needsAutoTranslate(displayedTitle, originalTitle, originalLang)) {
                queueTranslate(originalTitle, originalLang, currentLanguage, (translated) => {
                    if (document.body.contains(titleEl)) {
                        titleEl.innerText = translated;
                        titleEl.classList.remove("translating");
                    }
                });
            } else {
                titleEl.classList.remove("translating");
            }
        });
    }, { rootMargin: "200px" });

    document.querySelectorAll(".card").forEach(card => cardTranslateObserver.observe(card));
}

function changeCategory(type) {
    document.getElementById("detailView").style.display = "none";
    document.querySelector(".media-container").style.display = "block";

    const buttons = document.querySelectorAll(".nav-btn");
    buttons.forEach(btn => btn.classList.remove("active"));
    event.target.classList.add("active");

    currentCategory = type;
    document.getElementById("section-title").innerText = t("section_trending");

    window.scrollTo({ top: 0, behavior: 'smooth' });

    const heroBanner = document.getElementById("hero-banner");

    if (type === 'movie') {
        document.getElementById("section-title").innerText = t("section_movies");
        heroBanner.style.display = "none";
        document.body.classList.add("no-hero");
        fetchManyPages(`${BASE_URL}/discover/movie?sort_by=popularity.desc&language=${tmdbLang()}`, CATALOG_PAGES, (results) => {
            renderGrid(results, MAX_CATALOG_ITEMS, false);
        });
    } else if (type === 'tv') {
        document.getElementById("section-title").innerText = t("section_tv");
        heroBanner.style.display = "none";
        document.body.classList.add("no-hero");
        fetchManyPages(`${BASE_URL}/discover/tv?sort_by=popularity.desc&language=${tmdbLang()}`, CATALOG_PAGES, (results) => {
            renderGrid(results, MAX_CATALOG_ITEMS, false);
        });
    } else {
        heroBanner.style.display = "flex";
        document.body.classList.remove("no-hero");
        fetchData(`${BASE_URL}/trending/all/day?language=${tmdbLang()}`, (data) => {
            if (data && data.results) renderGrid(data.results, MAX_GRID_ITEMS, true);
        });
    }
}

function fetchManyPages(baseUrl, totalPages, callback) {
    const pageRequests = [];
    for (let page = 1; page <= totalPages; page++) {
        const separator = baseUrl.includes("?") ? "&" : "?";
        pageRequests.push(
            fetch(`${baseUrl}${separator}page=${page}`, {
                method: 'GET',
                headers: { accept: 'application/json', Authorization: `Bearer ${ACCESS_TOKEN}` }
            }).then(res => res.ok ? res.json() : { results: [] }).catch(() => ({ results: [] }))
        );
    }
    Promise.all(pageRequests).then(pages => {
        const combined = pages.flatMap(p => p.results || []);
        callback(combined);
    });
}

// ===================== SEARCH =====================
let searchDebounceTimer = null;

function handleSearch(event) {
    const query = document.getElementById("search-input").value.trim();

    if (event.key === "Enter") {
        closeSuggestions();
        triggerSearch();
        return;
    }

    clearTimeout(searchDebounceTimer);

    if (!query) {
        closeSuggestions();
        return;
    }

    searchDebounceTimer = setTimeout(() => {
        fetchSuggestions(query);
    }, 350);
}

function fetchSuggestions(query) {
    const url = `${BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=${tmdbLang()}`;
    fetchData(url, (data) => {
        const results = (data && data.results) ? data.results.filter(r => (r.title || r.name) && (r.media_type === 'movie' || r.media_type === 'tv')) : [];
        renderSuggestions(results.slice(0, 8));
    });
}

function renderSuggestions(results) {
    const list = document.getElementById("search-suggestions");
    list.innerHTML = "";

    if (results.length === 0) {
        list.innerHTML = `<li class="sugg-empty">${t("no_results")}</li>`;
        list.classList.add("open");
        return;
    }

    results.forEach(item => {
        const title = item.title || item.name;
        const type = item.media_type;
        const year = (item.release_date || item.first_air_date || "").slice(0, 4);
        const poster = item.poster_path ? (IMG_URL + item.poster_path) : "";

        const li = document.createElement("li");
        li.innerHTML = `
            ${poster ? `<img src="${poster}" alt="${title}">` : `<div class="sugg-info" style="width:36px;height:52px;"></div>`}
            <div class="sugg-info">
                <span class="sugg-title">${title}</span>
                <span class="sugg-meta">${type === 'tv' ? 'TV Show' : 'Movie'}${year ? ' • ' + year : ''}</span>
            </div>
        `;
        li.onclick = () => selectSuggestion(item.id, type, title);
        list.appendChild(li);
    });

    list.classList.add("open");
}

function selectSuggestion(id, type, title) {
    document.getElementById("search-input").value = title;
    closeSuggestions();
    const wrapper = document.getElementById("searchBoxWrapper");
    if (wrapper) wrapper.classList.remove("open");
    lastSearchQuery = title;
    document.getElementById("section-title").innerText = `${t("results_for")}: "${title}"`;
    fetchFullDetails(id, type, true);
}

function closeSuggestions() {
    const list = document.getElementById("search-suggestions");
    list.classList.remove("open");
    list.innerHTML = "";
}

function toggleSearchBox() {
    const wrapper = document.getElementById("searchBoxWrapper");
    const btn = document.getElementById("search-toggle-btn");
    const isOpen = wrapper.classList.toggle("open");

    if (isOpen) {
        const rect = btn.getBoundingClientRect();
        const wrapperWidth = wrapper.offsetWidth;
        const wrapperHeight = wrapper.offsetHeight;

        let left = rect.right + 10;
        if (left + wrapperWidth > window.innerWidth - 10) {
            left = rect.left - wrapperWidth - 10;
        }
        if (left < 10) left = 10;

        let top = rect.top + (rect.height / 2) - (wrapperHeight / 2);
        const maxTop = window.innerHeight - wrapperHeight - 10;
        if (top > maxTop) top = Math.max(10, maxTop);
        if (top < 10) top = 10;

        wrapper.style.top = top + "px";
        wrapper.style.left = left + "px";
        document.getElementById("search-input").focus();
    } else {
        document.getElementById("search-input").value = "";
        closeSuggestions();
    }
}

let lastKnownWindowWidth = window.innerWidth;
window.addEventListener("resize", () => {
    if (window.innerWidth === lastKnownWindowWidth) return;
    lastKnownWindowWidth = window.innerWidth;

    const wrapper = document.getElementById("searchBoxWrapper");
    if (wrapper && wrapper.classList.contains("open")) {
        wrapper.classList.remove("open");
    }
});

document.addEventListener("click", function(event) {
    const iconWrapper = document.querySelector(".search-icon-wrapper");
    if (iconWrapper && !iconWrapper.contains(event.target)) {
        closeSuggestions();
        const wrapper = document.getElementById("searchBoxWrapper");
        if (wrapper) wrapper.classList.remove("open");
    }
});

function triggerSearch() {
    document.getElementById("detailView").style.display = "none";
    document.querySelector(".media-container").style.display = "block";

    const query = document.getElementById("search-input").value.trim();
    if (!query) return;

    closeSuggestions();
    const wrapper = document.getElementById("searchBoxWrapper");
    if (wrapper) wrapper.classList.remove("open");

    currentCategory = "search";
    lastSearchQuery = query;
    const url = `${BASE_URL}/search/multi?query=${encodeURIComponent(query)}&language=${tmdbLang()}`;
    document.getElementById("section-title").innerText = `${t("results_for")}: "${query}"`;

    fetchData(url, (data) => {
        if (data && data.results && data.results.length > 0) {
            renderGrid(data.results, data.results.length, false);
            const firstItem = data.results[0];
            const type = firstItem.media_type || (firstItem.first_air_date ? 'tv' : 'movie');
            fetchFullDetails(firstItem.id, type);
        }
    });
}

// ===================== FETCH FULL DETAILS (UPDATED) =====================
function fetchFullDetails(id, type, autoplay = false) {
    const detailsUrl = `${BASE_URL}/${type}/${id}?append_to_response=credits,videos&language=${tmdbLang()}`;
    fetchData(detailsUrl, (data) => {
        if (autoplay) {
            showDetail(data, type);
        } else {
            updateSpotlight(data, type);
        }
        currentSelectedShow.id = data.id.toString();
        currentSelectedShow.type = type;
        if (data.videos && data.videos.results) {
            const trailer = data.videos.results.find(v => v.type === "Trailer" && v.site === "YouTube");
            currentSelectedShow.youtubeKey = trailer ? trailer.key : "";
        } else {
            currentSelectedShow.youtubeKey = "";
        }
    });

    if (!autoplay) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ===================== DETAIL VIEW =====================
function showDetail(data, type) {
    document.getElementById("hero-banner").style.display = "none";
    document.querySelector(".media-container").style.display = "none";
    const detailView = document.getElementById("detailView");
    detailView.style.display = "block";

    const title = data.title || data.name;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const url = `/movie/${data.id}/${slug}`;
    if (window.history && window.history.pushState) {
        window.history.pushState({ id: data.id, type: type }, title, url);
    }
    document.title = `${title} - AllFlix`;
    updateMetaTags(title, data.overview || "");

    document.getElementById("detailPoster").src = data.poster_path ? IMG_URL + data.poster_path : "";
    document.getElementById("detailType").innerText = type.toUpperCase();
    document.getElementById("detailTitle").innerText = title;
    document.getElementById("detailRating").innerHTML = `⭐ ${data.vote_average ? data.vote_average.toFixed(1) : 'N/A'}`;
    const runtime = data.runtime || (type === 'tv' ? data.episode_run_time?.[0] : 0);
    document.getElementById("detailRuntime").innerText = runtime ? `${Math.floor(runtime/60)}h ${runtime%60}m` : 'Unknown';
    document.getElementById("detailRelease").innerText = data.release_date || data.first_air_date || 'Unknown';
    document.getElementById("detailOverview").innerText = data.overview || 'No overview available.';

    const genresContainer = document.getElementById("detailGenres");
    genresContainer.innerHTML = '';
    if (data.genres && data.genres.length) {
        data.genres.forEach(g => {
            const span = document.createElement('span');
            span.innerText = g.name;
            genresContainer.appendChild(span);
        });
    }

    const directorEl = document.getElementById("detailDirector");
    if (data.credits && data.credits.crew) {
        const director = data.credits.crew.find(m => m.job === 'Director');
        directorEl.innerHTML = `<strong>Director:</strong> ${director ? director.name : 'Unknown'}`;
    } else {
        directorEl.innerHTML = `<strong>Director:</strong> Unknown`;
    }

    const castContainer = document.getElementById("detailCast");
    castContainer.innerHTML = '';
    if (data.credits && data.credits.cast) {
        const topCast = data.credits.cast.slice(0, 12);
        topCast.forEach(actor => {
            const div = document.createElement('div');
            div.className = 'detail-cast-item';
            const img = document.createElement('img');
            img.src = actor.profile_path ? IMG_URL + actor.profile_path : 'https://via.placeholder.com/80x80?text=?';
            img.alt = actor.name;
            const name = document.createElement('div');
            name.className = 'cast-name';
            name.innerText = actor.name;
            const role = document.createElement('div');
            role.className = 'cast-role';
            role.innerText = actor.character || '';
            div.appendChild(img);
            div.appendChild(name);
            div.appendChild(role);
            castContainer.appendChild(div);
        });
    }

    const trailerWrapper = document.getElementById("detailTrailerWrapper");
    trailerWrapper.innerHTML = '';
    let ytKey = '';
    if (data.videos && data.videos.results) {
        const trailer = data.videos.results.find(v => v.type === "Trailer" && v.site === "YouTube");
        if (trailer) ytKey = trailer.key;
    }
    if (ytKey) {
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${ytKey}`;
        iframe.allow = "autoplay; encrypted-media";
        iframe.allowFullscreen = true;
        trailerWrapper.appendChild(iframe);
    } else {
        trailerWrapper.innerHTML = `<p>No trailer available.</p>`;
    }

    currentDetailId = data.id;
    currentDetailType = type;
}

function updateMetaTags(title, description) {
    document.querySelector('meta[name="description"]')?.remove();
    const meta = document.createElement('meta');
    meta.name = "description";
    meta.content = description.substring(0, 160);
    document.head.appendChild(meta);
}

function closeDetail() {
    document.getElementById("hero-banner").style.display = "flex";
    document.querySelector(".media-container").style.display = "block";
    document.getElementById("detailView").style.display = "none";
    document.title = "AllFlix - Trailers & More";
    loadTrending();
    if (window.history && window.history.pushState) {
        window.history.pushState({}, "", "/");
    }
}

// ===================== SPOTLIGHT =====================
function updateSpotlight(data, type) {
    if (!data) return;
    const title = data.title || data.name;
    const originalTitle = data.original_title || data.original_name || title;
    const originalLang = data.original_language;

    document.getElementById("banner-title").innerText = title;
    document.getElementById("banner-tag").innerText = type.toUpperCase();

    if (needsAutoTranslate(title, originalTitle, originalLang)) {
        queueTranslate(originalTitle, originalLang, currentLanguage, (translated) => {
            document.getElementById("banner-title").innerText = translated;
        });
    }

    applySpotlightOverview(data, type);

    if (data.backdrop_path) {
        document.getElementById("hero-banner").style.backgroundImage = `linear-gradient(to top, #0c0c0c 10%, rgba(12,12,12,0.4) 50%, rgba(12,12,12,0.8) 100%), url('${BACKDROP_URL + data.backdrop_path}')`;
    }

    if (data.credits && data.credits.cast && data.credits.cast.length > 0) {
        const actors = data.credits.cast.slice(0, 3).map(a => a.name).join(", ");
        document.getElementById("banner-cast").innerText = actors;
    } else {
        document.getElementById("banner-cast").innerText = t("unknown_cast");
    }

    currentSelectedShow.id = data.id.toString();
    currentSelectedShow.type = type;

    let ytKey = "";
    if (data.videos && data.videos.results) {
        const trailer = data.videos.results.find(v => v.type === "Trailer" && v.site === "YouTube");
        if (trailer) ytKey = trailer.key;
    }
    currentSelectedShow.youtubeKey = ytKey;
}

function applySpotlightOverview(data, type) {
    const descEl = document.getElementById("banner-desc");

    if (data.overview) {
        descEl.innerText = data.overview;
        return;
    }

    descEl.innerText = t("no_overview");
    if (currentLanguage === "en") return;

    fetchData(`${BASE_URL}/${type}/${data.id}?language=en-US`, (enData) => {
        if (enData && enData.overview) {
            queueTranslate(enData.overview, "en", currentLanguage, (translated) => {
                descEl.innerText = translated;
            });
        }
    });
}

// ===================== VIDEO PLAYER =====================
function openPlayer() {
    const modal = document.getElementById("videoModal");
    const container = document.getElementById("player-container");
    const showId = currentSelectedShow.id;

    if (akingMgaStreamingLinks[showId]) {
        const akingLink = akingMgaStreamingLinks[showId];
        if (akingLink.endsWith(".mp4") || akingLink.includes("video")) {
            container.innerHTML = `
                <video controls autoplay>
                    <source src="${akingLink}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>`;
        } else {
            container.innerHTML = `<iframe src="${akingLink}" frameborder="0" allowfullscreen></iframe>`;
        }
    } else if (currentSelectedShow.youtubeKey) {
        container.innerHTML = `<iframe src="https://www.youtube.com/embed/${currentSelectedShow.youtubeKey}?autoplay=1" frameborder="0" allowfullscreen></iframe>`;
    } else {
        container.innerHTML = `<div style="text-align:center; padding: 50px; font-weight:bold; color:red;">${t("no_stream")}</div>`;
    }

    modal.style.display = "block";
}

function closePlayer() {
    const modal = document.getElementById("videoModal");
    const container = document.getElementById("player-container");
    container.innerHTML = "";
    modal.style.display = "none";
}

window.onclick = function(event) {
    const modal = document.getElementById("videoModal");
    if (event.target == modal) closePlayer();
};

// ===================== SIDE PANEL =====================
function toggleSidePanel() {
    document.getElementById("sidePanel").classList.toggle("open");
    document.getElementById("sideOverlay").classList.toggle("open");
}

function closeSidePanel() {
    document.getElementById("sidePanel").classList.remove("open");
    document.getElementById("sideOverlay").classList.remove("open");
}

function goHome() {
    closeSidePanel();
    document.getElementById("detailView").style.display = "none";
    document.querySelector(".media-container").style.display = "block";
    loadTrending();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===================== LANGUAGE =====================
const translations = {
    // (Ilagay ang buong translations object dito - hindi ko na inuulit para makatipid)
    // Siguraduhing kumpleto ang translations mula sa iyong orihinal na script.
    // Para sa brevity, ilalagay ko lang ang mga pangunahing entry.
    "en": {
        "nav_trending": "Trending",
        "nav_movies": "Movies",
        "nav_tv": "TV Shows & Anime",
        "search_placeholder": "Search for Movies, Anime, or Drama...",
        "home": "Home",
        "language": "Language",
        "mode": "Mode",
        "download": "Download",
        "about_us": "About Us",
        "select_language": "Select Language",
        "lang_note": "Note: Titles and descriptions are automatically translated when available. Some titles may stay in their original language if a translation isn't provided by the source.",
        "cast": "Cast:",
        "watch_now": "▶ Watch Now",
        "download_appname": "AllFLix Android",
        "download_badge": "Coming Soon",
        "download_text": "Watch full movies, TV episodes, anime, and dramas on the official AllFlix app.",
        "notify_me": "Notify Me",
        "notify_me_done": "You'll be notified!",
        "section_trending": "Trending Today",
        "section_movies": "Popular Movies",
        "section_tv": "Popular TV Shows & Anime",
        "brand": "ALLFLIX",
        "footer_about": "About",
        "footer_benefits": "Benefits",
        "footer_support": "Support",
        "footer_copy": "© 2026 AllFlix. All rights reserved.",
        "no_results": "No results found.",
        "results_for": "Results for",
        "no_overview": "No overview available for this title.",
        "unknown_cast": "Unknown Cast",
        "no_stream": "No streaming link or trailer available for this title yet."
    }
    // Idagdag ang ibang mga wika (tl, ja, ko, atbp.) dito gaya ng sa orihinal mong script.
    // Hindi ko na isinama lahat para sa haba, pero dapat kumpleto.
};

function t(key) {
    const dict = translations[currentLanguage] || translations.en;
    return dict[key] || translations.en[key] || key;
}

function toggleLanguagePanel() {
    document.getElementById("langOverlay").classList.add("open");
    document.getElementById("langPanel").classList.add("open");
}

function closeLanguagePanel() {
    document.getElementById("langOverlay").classList.remove("open");
    document.getElementById("langPanel").classList.remove("open");
}

function selectLanguage(langCode) {
    currentLanguage = langCode;
    localStorage.setItem(LANG_STORAGE_KEY, langCode);
    syncLanguageUI();
    applyLanguage();
    refreshContent();
    setTimeout(() => {
        closeLanguagePanel();
    }, 300);
}

function syncLanguageUI() {
    document.querySelectorAll("#lang-list li").forEach(li => {
        li.classList.toggle("selected", li.dataset.lang === currentLanguage);
    });
    document.documentElement.dir = rtlLanguages.includes(currentLanguage) ? "rtl" : "ltr";
    document.documentElement.lang = currentLanguage;
}

function refreshContent() {
    const lang = tmdbLang();

    if (currentCategory === "movie") {
        fetchManyPages(`${BASE_URL}/discover/movie?sort_by=popularity.desc&language=${lang}`, CATALOG_PAGES, (results) => {
            renderGrid(results, MAX_CATALOG_ITEMS, false);
        });
    } else if (currentCategory === "tv") {
        fetchManyPages(`${BASE_URL}/discover/tv?sort_by=popularity.desc&language=${lang}`, CATALOG_PAGES, (results) => {
            renderGrid(results, MAX_CATALOG_ITEMS, false);
        });
    } else if (currentCategory === "search" && lastSearchQuery) {
        const url = `${BASE_URL}/search/multi?query=${encodeURIComponent(lastSearchQuery)}&language=${lang}`;
        fetchData(url, (data) => {
            if (data && data.results) renderGrid(data.results, data.results.length, false);
        });
    } else {
        fetchData(`${BASE_URL}/trending/all/day?language=${lang}`, (data) => {
            if (data && data.results) {
                renderGrid(data.results, MAX_GRID_ITEMS, true);
                const firstItem = data.results[0];
                if (firstItem) {
                    const type = firstItem.media_type || (firstItem.first_air_date ? "tv" : "movie");
                    fetchFullDetails(firstItem.id, type);
                }
            }
        });
    }

    if (currentCategory !== "search" && currentSelectedShow.id && currentSelectedShow.type) {
        fetchFullDetails(currentSelectedShow.id, currentSelectedShow.type);
    }
}

function filterLanguages(event) {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll("#lang-list li").forEach(li => {
        const matches = li.textContent.toLowerCase().includes(query);
        li.classList.toggle("lang-hidden", !matches);
    });
}

function applyLanguage() {
    document.getElementById("nav-trending").innerText = t("nav_trending");
    document.getElementById("nav-movies").innerText = t("nav_movies");
    document.getElementById("nav-tv").innerText = t("nav_tv");
    document.getElementById("search-input").placeholder = t("search_placeholder");

    const brand = t("brand");
    document.getElementById("navbar-brand").innerText = brand;
    document.getElementById("side-brand").innerText = brand;
    const footerBrandFlix = document.getElementById("footer-brand-flix");
    if (brand === "ALLFLIX") {
        document.getElementById("footer-brand").childNodes[0].nodeValue = "ALL";
        footerBrandFlix.innerText = "FLIX";
    } else {
        document.getElementById("footer-brand").childNodes[0].nodeValue = "";
        footerBrandFlix.innerText = brand;
    }

    document.getElementById("footer-link-about").innerText = t("footer_about");
    document.getElementById("footer-link-benefits").innerText = t("footer_benefits");
    document.getElementById("footer-link-support").innerText = t("footer_support");
    document.getElementById("footer-copy").innerText = t("footer_copy");

    document.getElementById("label-home").innerText = t("home");
    document.getElementById("label-language").innerText = t("language");
    document.getElementById("label-mode").innerText = t("mode");
    document.getElementById("label-download").innerText = t("download");
    document.getElementById("label-aboutus").innerText = t("about_us");

    document.getElementById("label-select-language").innerText = t("select_language");
    document.getElementById("lang-note").innerText = t("lang_note");

    document.getElementById("label-cast").innerText = t("cast");
    document.getElementById("label-watchnow").innerText = t("watch_now");

    buildDownloadCards();

    const sectionTitle = document.getElementById("section-title");
    if (currentCategory === "movie") sectionTitle.innerText = t("section_movies");
    else if (currentCategory === "tv") sectionTitle.innerText = t("section_tv");
    else if (currentCategory === "trending") sectionTitle.innerText = t("section_trending");
}

// ===================== MODE =====================
const MOON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const SUN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

function applyModeOnLoad() {
    if (currentMode === "light") {
        document.body.classList.add("light-mode");
    } else {
        document.body.classList.remove("light-mode");
    }
    const icon = document.getElementById("mode-icon");
    if (icon) icon.innerHTML = currentMode === "light" ? SUN_SVG : MOON_SVG;
}

function toggleMode() {
    const body = document.body;
    const icon = document.getElementById("mode-icon");
    body.classList.toggle("light-mode");

    currentMode = body.classList.contains("light-mode") ? "light" : "dark";
    localStorage.setItem(MODE_STORAGE_KEY, currentMode);

    icon.innerHTML = currentMode === "light" ? SUN_SVG : MOON_SVG;
}

// ===================== DOWNLOAD =====================
const PLATFORM_DATA = [
    { id: "android",   icon: "📱", label: "Android",    date: "20260831" },
    { id: "windows",   icon: "🖥️", label: "Windows",    date: "20260930" },
    { id: "androidtv", icon: "📺", label: "Android TV", date: "20261031" },
    { id: "ios",       icon: "🍏", label: "iOS",        date: "20261130" },
    { id: "linux",     icon: "🐧", label: "Linux",      date: "20261231" },
    { id: "macos",     icon: "💻", label: "macOS",      date: "20270228" }
];

function buildDownloadCards() {
    const list = document.getElementById("download-list");
    if (!list) return;

    list.innerHTML = PLATFORM_DATA.map(p => `
            <div class="download-card">
                <div class="download-card-header">
                    <div class="download-card-title">
                        <span class="download-app-icon">${p.icon}</span>
                        <span>${p.label}</span>
                    </div>
                    <span class="download-badge">${t("download_badge")}</span>
                </div>
                <p class="download-card-desc">${t("download_text")}</p>
                <button class="btn-notify" id="btn-notify-${p.id}" onclick="notifyMe('${p.id}')">
                    <span class="notify-icon">🔔</span> <span>${t("notify_me")}</span>
                </button>
                <a class="notify-fallback" id="fallback-${p.id}"></a>
            </div>
    `).join("");
}

function showDownload() {
    closeSidePanel();
    buildDownloadCards();
    document.getElementById("downloadModal").style.display = "flex";
    document.body.style.overflow = "hidden";
}

function closeDownload() {
    document.getElementById("downloadModal").style.display = "none";
    document.body.style.overflow = "";
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }

function icsNextDay(yyyymmdd) {
    const y = +yyyymmdd.slice(0, 4), m = +yyyymmdd.slice(4, 6), d = +yyyymmdd.slice(6, 8);
    const dt = new Date(Date.UTC(y, m - 1, d + 1));
    return dt.getUTCFullYear() + pad2(dt.getUTCMonth() + 1) + pad2(dt.getUTCDate());
}

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function buildIcsFile(appName, date, endDate) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const uid = "allflix-" + date + "-" + Math.random().toString(36).slice(2) + "@allflix";
    const details = `${appName} launches today.`;
    return [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//AllFLix//Coming Soon//EN",
        "CALSCALE:GREGORIAN",
        "BEGIN:VEVENT",
        "UID:" + uid,
        "DTSTAMP:" + stamp,
        "DTSTART;VALUE=DATE:" + date,
        "DTEND;VALUE=DATE:" + endDate,
        "SUMMARY:" + appName + " launches!",
        "DESCRIPTION:" + details,
        "END:VEVENT",
        "END:VCALENDAR"
    ].join("\r\n");
}

function notifyMe(platformId) {
    const platform = PLATFORM_DATA.find(p => p.id === platformId);
    if (!platform) return;

    const btn = document.getElementById(`btn-notify-${platformId}`);
    const appName = platform.label;
    const endDate = icsNextDay(platform.date);
    const icsContent = buildIcsFile(appName, platform.date, endDate);
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const fileName = appName.replace(/\s+/g, "-").toLowerCase() + ".ics";

    if (isMobileDevice()) {
        window.location.href = blobUrl;
        const fallback = document.getElementById(`fallback-${platformId}`);
        if (fallback) {
            fallback.href = blobUrl;
            fallback.download = fileName;
            fallback.style.display = "none";
            clearTimeout(fallback._showTimer);
            fallback._showTimer = setTimeout(() => {
                fallback.textContent = "Didn't open? Tap to download instead";
                fallback.style.display = "block";
            }, 1800);
        }
    } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="notify-icon">✅</span> <span>${t("notify_me_done")}</span>`;
    }
}

// ===================== ABOUT US =====================
const aboutUsData = [
    { type: "h2", anchor: "about-section-about", text: "Welcome to AllFlix" },
    { type: "p", text: "Welcome to AllFlix, your ultimate destination for discovering the world of entertainment through trailers, teasers, promotional videos, and the latest previews from across the globe." },
    { type: "p", text: "At AllFlix, we are dedicated to collecting and showcasing a wide range of official trailers that allow fans to stay informed about upcoming releases while rediscovering beloved classics." },

    { type: "h2", text: "Our Story" },
    { type: "p", text: "The idea behind AllFlix was born from a simple observation: entertainment fans often have to visit multiple websites and platforms just to keep up with the latest trailers. We envisioned a single destination where everyone could discover the latest trailers regardless of where they originated." },

    { type: "h2", text: "Our Mission" },
    { type: "p", text: "Our mission is to become one of the world's most trusted destinations for discovering official entertainment trailers, making entertainment discovery simple, organized, and enjoyable for everyone." },

    { type: "h2", text: "Our Vision" },
    { type: "p", text: "Our vision is to build a global entertainment community where people from different countries can discover stories beyond borders, regardless of where they live or what language they speak." },

    { type: "h2", text: "What You'll Find on Our Website" },
    { type: "p", label: "Movies", text: "Official trailers for Hollywood blockbusters, independent films, and international cinema." },
    { type: "p", label: "Korean Dramas (K-Dramas)", text: "The newest Korean dramas across every genre." },
    { type: "p", label: "Japanese Dramas (J-Dramas)", text: "Previews spanning romance, suspense, comedy, and more." },
    { type: "p", label: "Chinese Dramas (C-Dramas)", text: "Historical epics, wuxia, modern romance, and thrillers." },
    { type: "p", label: "Anime", text: "TV anime, films, and original animations across every genre." },
    { type: "p", label: "Cartoons & Animated Films", text: "Family-friendly and internationally recognized animated productions." },

    { type: "h2", anchor: "about-section-benefits", text: "Benefits" },
    { type: "p", label: "Truly Global", text: "Every region, one site: Filipino, K-Drama, Turkish, European, Latin, Middle Eastern, African, anime, and more." },
    { type: "p", label: "Always Up To Date", text: "New previews added as they release." },
    { type: "p", label: "Organized Browsing", text: "Clear categories, less searching." },
    { type: "p", label: "No Language Barriers", text: "Discover storytelling beyond your own culture." },
    { type: "p", label: "Free to Browse", text: "No account required." },
    { type: "p", label: "Built for Fans", text: "Fast, clean, mobile-friendly." },

    { type: "h2", text: "Copyright & Disclaimer" },
    { type: "p", text: "All trailers, promotional videos, posters, logos, trademarks, titles, character names, and related media displayed on AllFlix remain the property of their respective copyright owners. Our website does not claim ownership of any copyrighted promotional material unless explicitly stated. All media is presented solely for informational, promotional, educational, commentary, and entertainment purposes." },
    { type: "p", text: "If you are a copyright owner or authorized representative and believe material on our website should be removed or updated, please contact us. We are committed to responding promptly and addressing legitimate concerns." },

    { type: "h2", anchor: "about-section-support", text: "Support" },
    { type: "p", text: "Questions, partnership ideas, or a copyright concern — we're listening." },
    { type: "p", label: "General / Copyright:", text: "idamgo549@gmail.com", skipTranslate: true },
    { type: "p", label: "Response time:", text: "Within 3–5 business days." },
    { type: "p", label: "Is AllFlix free to use?", text: "Yes, no account is required." },
    { type: "p", label: "Do you host full movies or episodes?", text: "No — trailers only, official previews sourced from studios worldwide." },
    { type: "p", label: "Can I suggest a title?", text: "Yes — just send the title, country of origin, and source of the official trailer to idamgo549@gmail.com." },

    { type: "h2", text: "Thank You" },
    { type: "p", text: "One Website. Thousands of Stories. Endless Entertainment." }
];

function renderAboutUs() {
    const container = document.getElementById("about-body-content");
    let html = "";

    aboutUsData.forEach((item, idx) => {
        const blockId = `about-block-${idx}`;
        if (item.type === "h2") {
            const idAttr = item.anchor ? ` id="${item.anchor}"` : "";
            html += `<h2${idAttr} data-about-id="${blockId}">${item.text}</h2>`;
        } else {
            const body = item.label ? `<strong>${item.label}</strong> — ${item.text}` : item.text;
            html += `<p data-about-id="${blockId}">${body}</p>`;
        }
    });

    container.innerHTML = html;

    if (currentLanguage === "en") return;

    aboutUsData.forEach((item, idx) => {
        if (item.skipTranslate) return;
        const blockId = `about-block-${idx}`;

        queueTranslate(item.text, "en", currentLanguage, (translatedText) => {
            const el = container.querySelector(`[data-about-id="${blockId}"]`);
            if (!el) return;

            if (item.label) {
                queueTranslate(item.label, "en", currentLanguage, (translatedLabel) => {
                    const el2 = container.querySelector(`[data-about-id="${blockId}"]`);
                    if (el2) el2.innerHTML = `<strong>${translatedLabel}</strong> — ${translatedText}`;
                });
            } else {
                el.innerText = translatedText;
            }
        });
    });
}

function showAboutUs(section) {
    closeSidePanel();
    renderAboutUs();
    document.getElementById("aboutModal").style.display = "block";

    if (section) {
        setTimeout(() => {
            const target = document.getElementById("about-section-" + section);
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
    } else {
        document.getElementById("about-body-content").scrollTop = 0;
    }
}

function closeAboutUs() {
    document.getElementById("aboutModal").style.display = "none";
}

// ===================== SITEMAP GENERATOR =====================
function generateSitemap() {
    const promises = [];
    const types = ['movie', 'tv'];
    types.forEach(t => {
        for (let page = 1; page <= 10; page++) {
            const url = `${BASE_URL}/discover/${t}?sort_by=popularity.desc&page=${page}&language=en-US`;
            promises.push(
                fetch(url, {
                    headers: { accept: 'application/json', Authorization: `Bearer ${ACCESS_TOKEN}` }
                }).then(res => res.ok ? res.json() : { results: [] })
                .catch(() => ({ results: [] }))
            );
        }
    });

    Promise.all(promises).then(pages => {
        const allItems = pages.flatMap(p => p.results || []);
        const unique = new Map();
        allItems.forEach(item => {
            const id = item.id;
            if (!unique.has(id)) unique.set(id, item);
        });
        const items = Array.from(unique.values());

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
        xml += `  <url><loc>${window.location.origin}/</loc><priority>1.0</priority></url>\n`;

        items.forEach(item => {
            const title = item.title || item.name;
            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
            const url = `${window.location.origin}/movie/${item.id}/${slug}`;
            xml += `  <url><loc>${url}</loc><priority>0.8</priority></url>\n`;
        });
        xml += '</urlset>';

        const blob = new Blob([xml], { type: 'application/xml' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'sitemap.xml';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    });
}

// I-expose sa global
window.generateSitemap = generateSitemap;