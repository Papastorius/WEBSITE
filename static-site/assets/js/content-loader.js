/**
 * Static content loader — replaces WordPress REST API calls
 * Loads page content and concerts from local JSON files.
 */

const PAGE_MAP = {
	'page-bio': 'bio',
	'page-projets': 'projets',
	'page-contact': 'contact',
};

const UPCOMING_CONCERTS_LIMIT = 5;

let pagesData = null;
let concertsData = null;
let showingAllConcerts = false;

async function fetchJSON(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status}`);
	}
	return response.json();
}

function formatDate(datetimeStr) {
	if (!datetimeStr) return '';
	const date = new Date(datetimeStr);
	return date.toLocaleDateString('fr-FR', {
		weekday: 'short',
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
}

function getUpcomingConcerts(concerts) {
	const now = Date.now();
	return [...concerts]
		.filter((c) => new Date(c.start_datetime).getTime() > now)
		.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
}

function renderConcertCards(concerts) {
	return concerts
		.map(
			(c) => `
		<article class="concert-card">
			<time class="concert-card__date">${formatDate(c.start_datetime)}</time>
			<h3 class="concert-card__title">${c.title}</h3>
			${c.location ? `<p class="concert-card__meta">${c.location}</p>` : ''}
			${c.description ? `<p class="concert-card__description">${c.description}</p>` : ''}
		</article>`
		)
		.join('');
}

function renderConcerts(concerts) {
	const container = document.querySelector('[data-concerts]');
	const moreBtn = document.querySelector('[data-concerts-more]');
	if (!container) return;

	const upcoming = getUpcomingConcerts(concerts);

	if (upcoming.length === 0) {
		container.innerHTML = '<p class="immersive-empty">Aucun concert à venir pour le moment.</p>';
		if (moreBtn) moreBtn.style.display = 'none';
		return;
	}

	// Show first 5
	const limited = upcoming.slice(0, UPCOMING_CONCERTS_LIMIT);
	container.innerHTML = renderConcertCards(limited);

	// Show/hide "voir tout" button
	if (moreBtn) {
		if (upcoming.length <= UPCOMING_CONCERTS_LIMIT) {
			moreBtn.style.display = 'none';
		} else {
			moreBtn.style.display = '';
			moreBtn.addEventListener('click', (e) => {
				e.preventDefault();
				if (showingAllConcerts) {
					container.innerHTML = renderConcertCards(limited);
					moreBtn.textContent = 'Voir tout l\'agenda →';
					showingAllConcerts = false;
				} else {
					container.innerHTML = renderConcertCards(upcoming);
					moreBtn.textContent = '← Réduire';
					showingAllConcerts = true;
				}
			});
		}
	}
}

function renderHomeHighlight(accueilData) {
	const container = document.querySelector('[data-home-highlight]');
	if (!container || !accueilData?.highlight) return;

	const h = accueilData.highlight;
	container.innerHTML = `
		<a class="home-highlight__link" href="${h.link}" target="_blank" rel="noopener">
			<img class="home-highlight__img" src="${h.image}" alt="${h.artist} — ${h.title}">
			<div class="home-highlight__info">
				<p class="home-highlight__eyebrow">Dernière sortie</p>
				<h2 class="home-highlight__title">${h.artist} — ${h.title}</h2>
				<p class="home-highlight__year">${h.year}</p>
				<p class="home-highlight__desc">${h.description}</p>
				<span class="home-highlight__cta">Écouter →</span>
			</div>
		</a>
	`;
}

function renderHomeVideos(accueilData) {
	const container = document.querySelector('[data-home-videos]');
	if (!container || !accueilData?.videos) return;

	const videosHTML = accueilData.videos
		.map((v) => {
			if (v.type === 'youtube' && v.url) {
				const videoId = extractYouTubeId(v.url);
				if (!videoId) return '';
				return `
				<div class="home-video-item">
					<div class="home-video-item__embed">
						<iframe
							src="https://www.youtube.com/embed/${videoId}"
							title="${v.title}"
							frameborder="0"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
						></iframe>
					</div>
					<p class="home-video-item__title">${v.title}</p>
					${v.link ? `<a class="home-video-item__link" href="${v.link.url}" target="_blank" rel="noopener">${v.link.label}</a>` : ''}
				</div>`;
			}
			if (v.type === 'local' && v.src) {
				return `
				<div class="home-video-item">
					<video class="home-video-item__player" controls preload="metadata" playsinline>
						<source src="${v.src}" type="video/mp4">
					</video>
					<p class="home-video-item__title">${v.title}</p>
				</div>`;
			}
			return '';
		})
		.filter(Boolean)
		.join('');

	if (!videosHTML) {
		container.style.display = 'none';
		return;
	}

	container.innerHTML = `
		<p class="immersive-page__eyebrow">Vidéos</p>
		<div class="home-videos__grid">${videosHTML}</div>
	`;
}

function extractYouTubeId(url) {
	try {
		const urlObj = new URL(url);
		return urlObj.searchParams.get('v') || urlObj.pathname.split('/').pop();
	} catch {
		return '';
	}
}

function extractVimeoId(url) {
	try {
		const urlObj = new URL(url);
		return urlObj.pathname.split('/').filter(Boolean).pop();
	} catch {
		return '';
	}
}

function renderCreations(creations) {
	const container = document.querySelector('[data-projets-creations]');
	if (!container || !creations || creations.length === 0) return;

	const embeds = creations
		.map((v) => {
			if (v.type === 'game' && v.url) {
				return `
				<div class="creations-grid__item creations-grid__item--game">
					<a class="creations-game-card" href="${v.url}" target="_blank" rel="noopener">
						${v.image ? `<img class="creations-game-card__img" src="${v.image}" alt="${v.title}">` : ''}
						<span class="creations-game-card__body">
							<span class="creations-game-card__icon">> </span>
							<span class="creations-game-card__info">
								<span class="creations-game-card__title">${v.title}</span>
								${v.description ? `<span class="creations-game-card__desc">${v.description}</span>` : ''}
							</span>
							<span class="creations-game-card__cta">[ Jouer ]</span>
						</span>
					</a>
				</div>`;
			}
			if (v.type === 'youtube' && v.url) {
				const videoId = extractYouTubeId(v.url);
				if (!videoId) return '';
				return `
				<div class="creations-grid__item">
					<div class="home-video-item__embed">
						<iframe
							src="https://www.youtube.com/embed/${videoId}"
							title="Création numérique"
							frameborder="0"
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
						></iframe>
					</div>
				</div>`;
			}
			if (v.type === 'vimeo' && v.url) {
				const vimeoId = extractVimeoId(v.url);
				if (!vimeoId) return '';
				return `
				<div class="creations-grid__item">
					<div class="home-video-item__embed">
						<iframe
							src="https://player.vimeo.com/video/${vimeoId}"
							title="Création numérique"
							frameborder="0"
							allow="autoplay; fullscreen; picture-in-picture"
						></iframe>
					</div>
				</div>`;
			}
			if (v.type === 'local' && v.src) {
				return `
				<div class="creations-grid__item">
					<video class="home-video-item__player" controls preload="metadata" playsinline>
						<source src="${v.src}" type="video/mp4">
					</video>
				</div>`;
			}
			return '';
		})
		.filter(Boolean)
		.join('');

	if (!embeds) return;

	container.innerHTML = `<div class="creations-grid">${embeds}</div>`;
}

// Track pointer start position to distinguish clicks from drags
let _ptrDownX = 0;
let _ptrDownY = 0;
const CLICK_THRESHOLD = 8; // px — movement below this counts as a click

document.addEventListener('pointerdown', (e) => {
	_ptrDownX = e.clientX;
	_ptrDownY = e.clientY;
}, { passive: true });

function wasClick(e) {
	const dx = e.clientX - _ptrDownX;
	const dy = e.clientY - _ptrDownY;
	return (dx * dx + dy * dy) < CLICK_THRESHOLD * CLICK_THRESHOLD;
}

function initProjetsTabs() {
	// CSS3D 3D transforms break hit-testing — the browser doesn't know where
	// buttons visually are. Use getBoundingClientRect() which DOES account for
	// 3D transforms, and manually detect clicks on tabs by position.
	function handleTabClick(x, y) {
		const tabs = document.querySelectorAll('[data-projets-tab]');
		const panels = document.querySelectorAll('[data-projets-panel]');

		for (const tab of tabs) {
			const rect = tab.getBoundingClientRect();
			if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
				const target = tab.dataset.projetsTab;
				tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
				panels.forEach((p) => p.classList.toggle('is-active', p.dataset.projetsPanel === target));
				return;
			}
		}
	}

	document.addEventListener('pointerup', (e) => {
		if (!wasClick(e)) return;
		handleTabClick(e.clientX, e.clientY);
	});
}

function initPanelLinks() {
	// CSS3D 3D transforms break click events on links inside panels.
	// Use getBoundingClientRect() to manually detect clicks on <a> elements.
	document.addEventListener('pointerup', (e) => {
		if (!wasClick(e)) return;
		const allLinks = document.querySelectorAll('.immersive-page__panel a[href]');
		for (const link of allLinks) {
			const rect = link.getBoundingClientRect();
			if (rect.width === 0 || rect.height === 0) continue;
			if (e.clientX >= rect.left && e.clientX <= rect.right &&
				e.clientY >= rect.top && e.clientY <= rect.bottom) {
				const href = link.getAttribute('href');
				if (!href || href === '#') return;
				const target = link.getAttribute('target');
				if (target === '_blank') {
					window.open(href, '_blank', 'noopener');
				} else {
					window.location.href = href;
				}
				return;
			}
		}
	});
}

function renderPageContent(sectionId, pageData) {
	const section = document.querySelector(`#${sectionId} [data-immersive-page-content]`);
	if (!section || !pageData) return;
	section.innerHTML = pageData.content;
}

export async function loadImmersiveContent() {
	let pages, concerts;
	try {
		[pages, concerts] = await Promise.all([
			fetchJSON('data/pages.json'),
			fetchJSON('data/concerts.json'),
		]);
	} catch (err) {
		console.warn('Content loading failed:', err.message);
		return;
	}

	pagesData = pages;
	concertsData = concerts;

	// Render page content
	for (const [sectionId, slug] of Object.entries(PAGE_MAP)) {
		if (pages[slug]) {
			renderPageContent(sectionId, pages[slug]);
		}
	}

	// Render home page sections
	if (pages.accueil) {
		renderHomeHighlight(pages.accueil);
		renderHomeVideos(pages.accueil);
	}

	// Render creations tab + init tabs
	if (pages.projets?.creations) {
		renderCreations(pages.projets.creations);
	}
	initProjetsTabs();
	initPanelLinks();

	// Render concerts (upcoming only, limited to 5)
	renderConcerts(concerts);
}
