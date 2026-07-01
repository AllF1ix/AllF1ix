// ---- Rail / card data (structure only — art comes from user drops) ----
const rails = [
  { title: "Continue Watching", sub: "Pick up where you left off", count: 8, badge: "" },
  { title: "Trending Movies", sub: "Most watched this week", count: 8, badge: "TOP 10" },
  { title: "K-Drama Picks", sub: "Fresh episodes weekly", count: 8, badge: "NEW" },
  { title: "Anime Spotlight", sub: "Fan favorites and new seasons", count: 8, badge: "" },
  { title: "C-Drama & J-Drama", sub: "Handpicked from across Asia", count: 8, badge: "" },
];

const railsContainer = document.getElementById('rails');

rails.forEach((rail, ri) => {
  const section = document.createElement('section');
  section.className = 'rail';

  const head = document.createElement('div');
  head.className = 'rail-head';
  head.innerHTML = `
    <div>
      <div class="rail-title">${rail.title}</div>
    </div>
    <div class="rail-sub">${rail.sub}</div>
  `;

  const track = document.createElement('div');
  track.className = 'rail-track';

  for (let i = 0; i < rail.count; i++) {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('tabindex', '0');
    card.innerHTML = `
      <div class="card-art">
        ${rail.badge ? `<span class="card-badge">${rail.badge}</span>` : ''}
        <div class="card-drop" data-slot="${rail.title}-${i+1}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          <span>Drop poster</span>
        </div>
      </div>
      <div class="card-meta">
        <div class="card-name">Title ${i + 1}</div>
        <div class="card-tags">Genre · Year</div>
      </div>
    `;
    // demo: clicking a poster slot shows a toast confirming where the image would land
    card.querySelector('.card-drop').addEventListener('click', (e) => {
      e.stopPropagation();
      showToast(`This slot is ready for: ${rail.title} — poster ${i + 1}`);
    });
    track.appendChild(card);
  }

  section.appendChild(head);
  section.appendChild(track);
  railsContainer.appendChild(section);
});

// ---- Header scroll state ----
const header = document.getElementById('siteHeader');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 40);
});

// ---- Hero drop click demo ----
document.getElementById('heroDrop').addEventListener('click', () => {
  showToast('This area is ready for: Featured backdrop image');
});

// ---- Settings panel ----
const settingsOverlay = document.getElementById('settingsOverlay');
document.getElementById('settingsBtn').addEventListener('click', () => settingsOverlay.classList.add('open'));
document.getElementById('closeSettings').addEventListener('click', () => settingsOverlay.classList.remove('open'));
settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) settingsOverlay.classList.remove('open'); });

document.querySelectorAll('.quality-pills .pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.quality-pills .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
  });
});

// ---- Search overlay ----
const searchOverlay = document.getElementById('searchOverlay');
document.getElementById('searchBtn').addEventListener('click', () => {
  searchOverlay.classList.add('open');
  document.getElementById('searchInput').focus();
});
document.getElementById('closeSearch').addEventListener('click', () => searchOverlay.classList.remove('open'));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    searchOverlay.classList.remove('open');
    settingsOverlay.classList.remove('open');
  }
});
document.querySelectorAll('.search-tag').forEach(tag => {
  tag.addEventListener('click', () => { document.getElementById('searchInput').value = tag.textContent; });
});

// ---- Toast helper ----
let toastTimer;
function showToast(msg){
  const toast = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}
