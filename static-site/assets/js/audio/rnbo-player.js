import { initRNBOPlayer, setMessRNBO, setParamRNBO } from './rnbo-engine.js';

let isScrubbing = false;
let currentSec = 0;
let totalSec = 0;
let playerAssetsPromise;
let trackNames = [];
const START_TRACK_INDEX = 0; // Start on the first RNBO multibuffer entry
let currentTrackIndex = START_TRACK_INDEX;
let hasExplicitTrackSelection = false;
let pendingRequestedTrackIndex = null;
let incomingTrackIndexBase = null;

// Display names override (keyed by filename without extension)
const TRACK_DISPLAY_NAMES = {
	'irina-gonzalez-la-primavera': 'Kiko Ruiz — La Primavera',
	'kiko-ruiz-la-primavera': 'Kiko Ruiz — La Primavera',
	'liya-grigoryan-trio': 'Liya Grigoryan Trio',
	'amaury-faye-believe-it-or-not': 'Amaury Faye — Believe It or Not',
	'daoud-platos-twins': "Daoud — Plato's Twins",
	'ekko-turbolent': 'Ekko — Turbolent',
};
let isPlaying = true;
const BAR_LENGTH = 20;
const FILLED = '▮';
const EMPTY = '▯';

// Discography data (loaded from pages.json)
let discoItems = [];

function getTimeNode() {
	return document.getElementById('rnbo-time-display');
}

function formatTime(seconds) {
	const minutes = Math.floor(seconds / 60);
	const remainder = Math.floor(seconds % 60);
	return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function renderTime() {
	const timeNode = getTimeNode();
	if (!timeNode) {
		return;
	}

	if (totalSec > 0) {
		timeNode.textContent = `${formatTime(currentSec)} / ${formatTime(totalSec)}`;
		return;
	}

	timeNode.textContent = formatTime(currentSec);
}

function renderBar(level01) {
	const barNode = document.getElementById('rnbo-bar');
	if (!barNode) return;
	const filled = Math.round(level01 * BAR_LENGTH);
	barNode.textContent = FILLED.repeat(filled) + EMPTY.repeat(BAR_LENGTH - filled);
}

function clampTrackIndex(index) {
	if (trackNames.length <= 0) {
		return Math.max(0, index);
	}

	return Math.max(0, Math.min(trackNames.length - 1, index));
}

function normalizeTrackIndex(index) {
	const rawIndex = Math.round(Number(index));
	if (!Number.isFinite(rawIndex)) {
		return currentTrackIndex;
	}

	if (trackNames.length <= 0) {
		return Math.max(0, rawIndex);
	}

	if (incomingTrackIndexBase === 'zero') {
		return clampTrackIndex(rawIndex);
	}

	if (incomingTrackIndexBase === 'one') {
		return clampTrackIndex(rawIndex - 1);
	}

	if (pendingRequestedTrackIndex !== null) {
		if (rawIndex === pendingRequestedTrackIndex) {
			incomingTrackIndexBase = 'zero';
			pendingRequestedTrackIndex = null;
			return clampTrackIndex(rawIndex);
		}

		if ((rawIndex - 1) === pendingRequestedTrackIndex) {
			incomingTrackIndexBase = 'one';
			pendingRequestedTrackIndex = null;
			return clampTrackIndex(rawIndex - 1);
		}
	}

	const candidates = [];
	if (rawIndex >= 0 && rawIndex < trackNames.length) {
		candidates.push(rawIndex);
	}

	const oneBasedIndex = rawIndex - 1;
	if (oneBasedIndex >= 0 && oneBasedIndex < trackNames.length && !candidates.includes(oneBasedIndex)) {
		candidates.push(oneBasedIndex);
	}

	if (candidates.length === 0) {
		return clampTrackIndex(rawIndex);
	}

	if (candidates.length > 1 && candidates.includes(currentTrackIndex)) {
		return candidates.find((candidate) => candidate !== currentTrackIndex) ?? currentTrackIndex;
	}

	return candidates[0];
}

function formatTrackDisplayName(filename) {
	const key = String(filename || '').replace(/\.[^.]+$/, '');
	return TRACK_DISPLAY_NAMES[key] || key.replace(/_/g, ' ');
}

export function updateEnvBar(envValue) {
	const level = Math.max(0, Math.min(1, envValue / 10));
	renderBar(level);
}

function switchToTrack(index) {
	if (index < 0) return;
	if (trackNames.length > 0 && index >= trackNames.length) return;

	pendingRequestedTrackIndex = index;
	setMessRNBO('index', index);

	// Update UI immediately
	currentTrackIndex = index;
	updateTrackDisplay();
	updatePlaylistHighlight();

	currentSec = 0;
	totalSec = 0;
	renderTime();
	isPlaying = true;
	const toggleBtn = document.getElementById('rnbo-toggle');
	if (toggleBtn) {
		toggleBtn.setAttribute('aria-pressed', 'true');
		toggleBtn.setAttribute('aria-label', 'Pause');
	}
}

function updateTrackDisplay() {
	const name = trackNames[currentTrackIndex] || `Track ${currentTrackIndex + 1}`;
	const trackNode = document.getElementById('rnbo-track-name');
	if (trackNode) trackNode.textContent = name;
}

function updatePlaylistHighlight() {
	const items = document.querySelectorAll('#rnbo-playlist-tracks .rnbo-playlist__item');
	items.forEach((item, i) => {
		item.classList.toggle('is-active', i === currentTrackIndex);
		const icon = item.querySelector('.rnbo-playlist__item-icon');
		if (icon) icon.textContent = i === currentTrackIndex ? '▶' : '○';
	});
}

function renderPlaylistTracks() {
	const list = document.getElementById('rnbo-playlist-tracks');
	if (!list) return;

	list.innerHTML = trackNames.map((name, i) => `
		<li class="rnbo-playlist__item ${i === currentTrackIndex ? 'is-active' : ''}" data-track-index="${i}">
			<span class="rnbo-playlist__item-icon">${i === currentTrackIndex ? '▶' : '○'}</span>
			<span class="rnbo-playlist__item-name">${name}</span>
		</li>
	`).join('');

	// Click handlers
	list.querySelectorAll('.rnbo-playlist__item').forEach((item) => {
		item.addEventListener('click', () => {
			const idx = parseInt(item.dataset.trackIndex, 10);
			hasExplicitTrackSelection = true;
			switchToTrack(idx);
		});
	});
}

function renderPlaylistDisco() {
	const list = document.getElementById('rnbo-playlist-disco');
	if (!list || discoItems.length === 0) return;

	list.innerHTML = discoItems.map((d) => {
		if (d.link) {
			return `
			<li class="rnbo-playlist__item rnbo-playlist__item--disco" data-disco-link="${d.link}">
				<span class="rnbo-playlist__item-icon">↗</span>
				<span class="rnbo-playlist__item-name">${d.artist} — ${d.title || ''}</span>
				<span class="rnbo-playlist__item-meta">${d.year}</span>
			</li>`;
		}
		return `
		<li class="rnbo-playlist__item rnbo-playlist__item--disco" style="opacity:0.4;cursor:default">
			<span class="rnbo-playlist__item-icon">·</span>
			<span class="rnbo-playlist__item-name">${d.artist} — ${d.title || ''}</span>
			<span class="rnbo-playlist__item-meta">${d.year}</span>
		</li>`;
	}).join('');

	// Click handlers for external links
	list.querySelectorAll('[data-disco-link]').forEach((item) => {
		item.addEventListener('click', () => {
			window.open(item.dataset.discoLink, '_blank', 'noopener');
		});
	});
}

function togglePlaylist(forceState) {
	const panel = document.getElementById('rnbo-playlist');
	const btn = document.getElementById('rnbo-playlist-toggle');
	if (!panel || !btn) return;

	const isOpen = typeof forceState === 'boolean' ? !forceState : panel.classList.contains('is-open');

	if (isOpen) {
		panel.classList.remove('is-open');
		panel.setAttribute('aria-hidden', 'true');
		btn.setAttribute('aria-expanded', 'false');
	} else {
		panel.classList.add('is-open');
		panel.setAttribute('aria-hidden', 'false');
		btn.setAttribute('aria-expanded', 'true');
	}
}

export function initPlayerAssets(rnboBaseUrl) {
	if (!playerAssetsPromise) {
		const baseUrl = String(rnboBaseUrl || './rnbo').replace(/\/$/, '');
		playerAssetsPromise = initRNBOPlayer(
			`${baseUrl}/Lecteur.export.json`,
			`${baseUrl}/media/dependencies.json`
		);

		// Load track names from the RNBO patch itself so the UI order matches multibuffer.
		fetch(`${baseUrl}/Lecteur.export.json`)
			.then((r) => r.json())
			.then((patch) => {
				const refs = patch?.desc?.externalDataRefs;
				if (!Array.isArray(refs) || refs.length === 0) {
					throw new Error('No RNBO externalDataRefs found.');
				}

				trackNames = refs.map((ref) => formatTrackDisplayName(ref.file));
				currentTrackIndex = clampTrackIndex(currentTrackIndex);
				updateTrackDisplay();
				renderPlaylistTracks();
			})
			.catch(() => {
				fetch(`${baseUrl}/media/dependencies.json`)
					.then((r) => r.json())
					.then((deps) => {
						if (!Array.isArray(deps) || deps.length === 0) return;
						trackNames = deps.map((d) => formatTrackDisplayName(d.file));
						currentTrackIndex = clampTrackIndex(currentTrackIndex);
						updateTrackDisplay();
						renderPlaylistTracks();
					})
					.catch(() => {});
			});

		// Load discography from pages.json for the playlist
		fetch('data/pages.json')
			.then((r) => r.json())
			.then((pages) => {
				if (!pages.projets?.content) return;
				// Parse disco items from HTML content
				const parser = new DOMParser();
				const doc = parser.parseFromString(pages.projets.content, 'text/html');
				const items = doc.querySelectorAll('.disco-item');
				discoItems = Array.from(items).map((el) => {
					const artist = el.querySelector('.disco-artist')?.textContent || '';
					const year = el.querySelector('.disco-year')?.textContent || '';
					const linkEl = el.querySelector('a[href]');
					const link = linkEl?.getAttribute('href') || '';
					return { artist, year, title: '', link };
				});
				renderPlaylistDisco();
			})
			.catch(() => {});
	}

	return playerAssetsPromise;
}

export function initPlayerUI() {
	const toggleButton = document.getElementById('rnbo-toggle');
	const volume = document.getElementById('rnbo-volume');
	const seek = document.getElementById('rnbo-seek');
	const prevBtn = document.getElementById('rnbo-prev');
	const nextBtn = document.getElementById('rnbo-next');
	const playlistToggle = document.getElementById('rnbo-playlist-toggle');
	const playlistClose = document.getElementById('rnbo-playlist-close');

	let wasPlayingBeforeSeek = false;

	toggleButton?.addEventListener('click', (event) => {
		event.preventDefault();

		isPlaying = !isPlaying;
		toggleButton.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
		toggleButton.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
		setMessRNBO('play', isPlaying);
	});

	// Prev/next track buttons
	prevBtn?.addEventListener('click', (e) => {
		e.preventDefault();
		const prev = (currentTrackIndex - 1 + trackNames.length) % trackNames.length;
		hasExplicitTrackSelection = true;
		switchToTrack(prev);
	});

	nextBtn?.addEventListener('click', (e) => {
		e.preventDefault();
		const next = (currentTrackIndex + 1) % trackNames.length;
		hasExplicitTrackSelection = true;
		switchToTrack(next);
	});

	// Playlist toggle
	playlistToggle?.addEventListener('click', (e) => {
		e.preventDefault();
		togglePlaylist();
	});

	playlistClose?.addEventListener('click', (e) => {
		e.preventDefault();
		togglePlaylist(false);
	});

	// Close playlist when clicking outside
	document.addEventListener('pointerdown', (e) => {
		const panel = document.getElementById('rnbo-playlist');
		const btn = document.getElementById('rnbo-playlist-toggle');
		if (!panel?.classList.contains('is-open')) return;
		if (panel.contains(e.target) || btn?.contains(e.target)) return;
		togglePlaylist(false);
	});

	volume?.addEventListener('input', (event) => {
		setParamRNBO('volume', Number(event.target.value));
	});

	seek?.addEventListener('pointerdown', () => {
		isScrubbing = true;
		wasPlayingBeforeSeek = isPlaying;
		if (wasPlayingBeforeSeek) {
			setMessRNBO('stop', 1);
		}
	});

	seek?.addEventListener('input', (event) => {
		const val = Number(event.target.value);
		setMessRNBO('seek', val);
		if (totalSec > 0) {
			currentSec = val * totalSec;
			renderTime();
		}
	});

	seek?.addEventListener('pointerup', () => {
		isScrubbing = false;
		if (wasPlayingBeforeSeek) {
			setMessRNBO('start', 1);
		}
	});
}

export function setTimeSeconds(seconds) {
	currentSec = Math.max(0, Number(seconds) || 0);
	renderTime();
}

export function setTotalSeconds(seconds) {
	totalSec = Math.max(0, Number(seconds) || 0);
	renderTime();
}

export function updateProgress(phase01) {
	if (isScrubbing) {
		return;
	}

	const seek = document.getElementById('rnbo-seek');
	if (seek) {
		seek.value = String(phase01);
	}

}

export function setTrackIndex(index) {
	currentTrackIndex = normalizeTrackIndex(index);
	updateTrackDisplay();
	updatePlaylistHighlight();
}

export function jumpToStartTrack() {
	const preferredTrackIndex = hasExplicitTrackSelection ? currentTrackIndex : START_TRACK_INDEX;
	if (preferredTrackIndex < 0) return;
	if (trackNames.length > 0 && preferredTrackIndex >= trackNames.length) return;
	switchToTrack(preferredTrackIndex);
}
