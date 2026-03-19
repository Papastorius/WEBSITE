import { initRNBOPlayer, setMessRNBO, setParamRNBO } from './rnbo-engine.js';

let isScrubbing = false;
let currentSec = 0;
let totalSec = 0;
let playerAssetsPromise;
let trackNames = [];
const BAR_LENGTH = 20;
const FILLED = '▮';
const EMPTY = '▯';

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

export function updateEnvBar(envValue) {
	const level = Math.max(0, Math.min(1, envValue / 10));
	renderBar(level);
}

export function initPlayerAssets(rnboBaseUrl) {
	if (!playerAssetsPromise) {
		const baseUrl = String(rnboBaseUrl || './rnbo').replace(/\/$/, '');
		playerAssetsPromise = initRNBOPlayer(
			`${baseUrl}/Lecteur.export.json`,
			`${baseUrl}/media/dependencies.json`
		);

		// Load track names from dependencies
		fetch(`${baseUrl}/media/dependencies.json`)
			.then((r) => r.json())
			.then((deps) => {
				if (deps && deps.length > 0) {
					trackNames = deps.map((d) =>
						d.file.replace(/\.[^.]+$/, '').replace(/_/g, ' ')
					);
					// Show first track by default
					setTrackIndex(0);
				}
			})
			.catch(() => {});
	}

	return playerAssetsPromise;
}

export function initPlayerUI() {
	const toggleButton = document.getElementById('rnbo-toggle');
	const volume = document.getElementById('rnbo-volume');
	const seek = document.getElementById('rnbo-seek');

	let isPlaying = true;
	let wasPlayingBeforeSeek = false;

	toggleButton?.addEventListener('click', (event) => {
		event.preventDefault();

		isPlaying = !isPlaying;
		toggleButton.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
		toggleButton.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
		setMessRNBO('play', isPlaying);
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
	const i = Math.round(Number(index) || 0);
	const name = trackNames[i] || `Track ${i + 1}`;
	const trackNode = document.getElementById('rnbo-track-name');
	if (trackNode) trackNode.textContent = name;
}
