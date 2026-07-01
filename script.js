const API_KEY = "74cbc0752e0a36fdac6657bb206f0bec";
const BASE_URL = "https://themoviedb.org";
const IMG_URL = "https://tmdb.org";
const BACKDROP_URL = "https://tmdb.org";

// 🛠️ DITO MO ILALAGAY ANG MGA SARILI MONG STREAMING LINKS BASI SA TMDB ID
// Paano gamitin: Kunin ang ID ng palabas sa TMDB at itugma sa iyong video file
const akingMgaStreamingLinks = {
    "23156": "https://iyong-server.com", // Halimbawa lang (23156 ang ID ng Naruto sa TMDB)
    "550": "https://iyong-server.com"
};

let currentSelectedShow = { id: "", type: "", youtubeKey: "" };

// Pag-load ng Trending data sa simula
window.onload = function() {
    fetchData(`${BASE_URL}/trending/all/day?api_key=${API_KEY}`, (data) => {
        renderGrid(data.results);
        if(data.results.length > 0) updateSpotlight(data.results[0], data.results[0].media_type || 'movie');
    });
};

// Generic Fetcher
function fetchData(url, callback) {
    fetch(url)
        .then(res => res.json())
        .then(data => callback(data))
        .catch(err => console.error("Error loading data from TMDB:", err));
}

// Pag-render ng mga Card sa Screen
function renderGrid(items) {
    const grid = document.getElementById("media-grid-items");
    grid.innerHTML = "";

    items.forEach(item => {
        if (!item.poster_path) return; // Laktawan kung walang poster image
        const title = item.title || item.name;
        const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');

        const cardHTML = `
            <div class="card" onclick="fetchFullDetails('${item.id}', '${type}')">
                <img src="${IMG_URL + item.poster_path}" alt="${title}">
                <div class="card-details">
                    <div class="card-title">${title}</div>
                </div>
            </div>
        `;
        grid.innerHTML += cardHTML;
    });
}

// Paglipat ng Menu Tabs (Trending, Movies, TV/Anime)
function changeCategory(type) {
    const buttons = document.querySelectorAll(".nav-btn");
    buttons.forEach(btn => btn.classList.remove("active"));
    event.target.classList.add("active");

    let url = `${BASE_URL}/trending/all/day?api_key=${API_KEY}`;
    document.getElementById("section-title").innerText = "Trending Now";

    if (type === 'movie') {
        url = `${BASE_URL}/discover/movie?api_key=${API_KEY}&sort_by=popularity.desc`;
        document.getElementById("section-title").innerText = "Popular Movies";
    } else if (type === 'tv') {
        url = `${BASE_URL}/discover/tv?api_key=${API_KEY}&sort_by=popularity.desc`;
        document.getElementById("section-title").innerText = "Popular TV Shows & Anime";
    }
    fetchData(url, (data) => renderGrid(data.results));
}

// Automatic Search Functions
function handleSearch(event) {
    if (event.key === "Enter") triggerSearch();
}

function triggerSearch() {
    const query = document.getElementById("search-input").value.trim();
    if (!query) return;

    const url = `${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}`;
    document.getElementById("section-title").innerText = `Resulta para sa: "${query}"`;
    
    fetchData(url, (data) => {
        renderGrid(data.results);
        if (data.results.length > 0) {
            updateSpotlight(data.results[0], data.results[0].media_type || 'movie');
        }
    });
}

// Pagkuha ng Kumpletong Detalye (Cast at Video Backup)
function fetchFullDetails(id, type) {
    const detailsUrl = `${BASE_URL}/${type}/${id}?api_key=${API_KEY}&append_to_response=credits,videos`;
    fetchData(detailsUrl, (data) => updateSpotlight(data, type));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Pag-update sa Spotlight Banner sa taas
function updateSpotlight(data, type) {
    const title = data.title || data.name;
    document.getElementById("banner-title").innerText = title;
    document.getElementById("banner-desc").innerText = data.overview || "Walang nakikitang buod para sa palabas na ito.";
    document.getElementById("banner-tag").innerText = type.toUpperCase();

    // Set Background Image
    if (data.backdrop_path) {
        document.getElementById("hero-banner").style.backgroundImage = `linear-gradient(to top, #0c0c0c 10%, rgba(12,12,12,0.4) 50%, rgba(12,12,12,0.8) 100%), url('${BACKDROP_URL + data.backdrop_path}')`;
    }

    // Awtomatikong kunin ang mga Pangunahing Aktor (Cast)
    if (data.credits && data.credits.cast) {
        const actors = data.credits.cast.slice(0, 3).map(a => a.name).join(", ");
        document.getElementById("banner-cast").innerText = actors || "Unknown Cast";
    } else {
        document.getElementById("banner-cast").innerText = "N/A";
    }

    // Itabi ang kasalukuyang IDs para sa Player mamaya
    currentSelectedShow.id = data.id.toString();
    currentSelectedShow.type = type;

    // Maghanap ng YouTube Trailer link mula sa TMDB bilang backup kung wala ka pang video file
    let ytKey = "";
    if (data.videos && data.videos.results) {
        const trailer = data.videos.results.find(v => v.type === "Trailer" && v.site === "YouTube");
        if (trailer) ytKey = trailer.key;
    }
    currentSelectedShow.youtubeKey = ytKey;
}

// 🍿 LOGIC KUNG PAANO IPAPATUGTOG ANG IYONG STREAMING VIDEO LINK O TRAILER
function openPlayer() {
    const modal = document.getElementById("videoModal");
    const container = document.getElementById("player-container");
    const showId = currentSelectedShow.id;

    // 1. Titingnan kung may inilagay kang sariling streaming link sa object sa taas
    if (akingMgaStreamingLinks[showId]) {
        const akingLink = akingMgaStreamingLinks[showId];
        
        // Kung .mp4 file ang link mo, gagamit ito ng HTML5 video tag
        if (akingLink.endsWith(".mp4") || akingLink.includes("video")) {
            container.innerHTML = `
                <video controls autoplay>
                    <source src="${akingLink}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>`;
        } else {
            // Kung cloud storage player (tulad ng Google Drive embed o Doodstream iframe), gagamit ng Iframe
            container.innerHTML = `<iframe src="${akingLink}" frameborder="0" allowfullscreen></iframe>`;
        }
    } 
    // 2. BACKUP: Kung wala ka pang nailalagay na link, YouTube trailer muna ang magpe-play para gumana pa rin ang site
    else if (currentSelectedShow.youtubeKey) {
        container.innerHTML = `<iframe src="https://youtube.com{currentSelectedShow.youtubeKey}?autoplay=1" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    } else {
        container.innerHTML = `<div style="text-align:center; padding: 50px; font-weight:bold; color:red;">Paumanhin! Wala pang nakalagay na streaming link para sa palabas na ito.</div>`;
    }

    modal.style.display = "block";
}

function closePlayer() {
    const modal = document.getElementById("videoModal");
    const container = document.getElementById("player-container");
    container.innerHTML = ""; // Alisin ang element para awtomatikong huminto ang video player
    modal.style.display = "none";
}

// Isara ang modal kapag pinindot ang itim na space sa labas
window.onclick = function(event) {
    const modal = document.getElementById("videoModal");
    if (event.target == modal) closePlayer();
};