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

let currentSelectedShow = { id: "", type: "", youtubeKey: "" };

// Pag-load sa simula ng Trending
window.onload = function() {
    const url = `${BASE_URL}/trending/all/day`;
    fetchData(url, (data) => {
        if (data && data.results && data.results.length > 0) {
            renderGrid(data.results);
            const firstItem = data.results[0];
            const type = firstItem.media_type || (firstItem.first_air_date ? 'tv' : 'movie');
            fetchFullDetails(firstItem.id, type);
        }
    });
};

// Secured Fetcher gamit ang Authorization Headers (Anti-CORS Block)
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

// Pag-render ng mga Card sa Screen
function renderGrid(items) {
    const grid = document.getElementById("media-grid-items");
    grid.innerHTML = "";

    items.forEach(item => {
        if (!item.poster_path) return; 
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

    let url = `${BASE_URL}/trending/all/day`;
    document.getElementById("section-title").innerText = "Trending Now";

    if (type === 'movie') {
        url = `${BASE_URL}/discover/movie?sort_by=popularity.desc`;
        document.getElementById("section-title").innerText = "Popular Movies";
    } else if (type === 'tv') {
        url = `${BASE_URL}/discover/tv?sort_by=popularity.desc`;
        document.getElementById("section-title").innerText = "Popular TV Shows & Anime";
    }
    fetchData(url, (data) => {
        if(data && data.results) renderGrid(data.results);
    });
}

// Search Functions
function handleSearch(event) {
    if (event.key === "Enter") triggerSearch();
}

function triggerSearch() {
    const query = document.getElementById("search-input").value.trim();
    if (!query) return;

    const url = `${BASE_URL}/search/multi?query=${encodeURIComponent(query)}`;
    document.getElementById("section-title").innerText = `Resulta para sa: "${query}"`;
    
    fetchData(url, (data) => {
        if (data && data.results && data.results.length > 0) {
            renderGrid(data.results);
            const firstItem = data.results[0];
            const type = firstItem.media_type || (firstItem.first_air_date ? 'tv' : 'movie');
            fetchFullDetails(firstItem.id, type);
        }
    });
}

// Pagkuha ng Kumpletong Detalye (Cast at Video Backup)
function fetchFullDetails(id, type) {
    const detailsUrl = `${BASE_URL}/${type}/${id}?append_to_response=credits,videos`;
    fetchData(detailsUrl, (data) => updateSpotlight(data, type));
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Pag-update sa Spotlight Banner sa taas
function updateSpotlight(data, type) {
    if (!data) return;
    const title = data.title || data.name;
    document.getElementById("banner-title").innerText = title;
    document.getElementById("banner-desc").innerText = data.overview || "Walang nakikitang buod para sa palabas na ito.";
    document.getElementById("banner-tag").innerText = type.toUpperCase();

    // Set Background Image
    if (data.backdrop_path) {
        document.getElementById("hero-banner").style.backgroundImage = `linear-gradient(to top, #0c0c0c 10%, rgba(12,12,12,0.4) 50%, rgba(12,12,12,0.8) 100%), url('${BACKDROP_URL + data.backdrop_path}')`;
    }

    // Cast details
    if (data.credits && data.credits.cast && data.credits.cast.length > 0) {
        const actors = data.credits.cast.slice(0, 3).map(a => a.name).join(", ");
        document.getElementById("banner-cast").innerText = actors;
    } else {
        document.getElementById("banner-cast").innerText = "Unknown Cast";
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

// VIDEO PLAYER LOGIC
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
        container.innerHTML = `<div style="text-align:center; padding: 50px; font-weight:bold; color:red;">Wala pang streaming link o trailer para rito.</div>`;
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