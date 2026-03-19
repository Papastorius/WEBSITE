/**
 * Visitor data display — installation status monitor
 * Artistic data: session, time, cursor, audio state.
 */

let mouseX = 0;
let mouseY = 0;
let sessionId = '';

export function initVisitorData() {
	const container = document.querySelector('[data-visitor-data]');
	if (!container) return;

	sessionId = (crypto.randomUUID?.()?.slice(0, 8) || Math.random().toString(36).slice(2, 10)).toUpperCase();

	document.addEventListener('mousemove', (e) => {
		mouseX = e.clientX;
		mouseY = e.clientY;
	});

	render(container);
	setInterval(() => updateLive(container), 200);
}

function render(container) {
	const now = new Date();

	const lines = [
		{ label: 'SESSION', value: sessionId, live: '' },
		{ label: 'SYS.TIME', value: formatTime(now), live: 'clock' },
		{ label: 'CURSOR', value: `${mouseX}, ${mouseY}`, live: 'mouse' },
		{ label: 'VIEWPORT', value: `${window.innerWidth}\u00D7${window.innerHeight}`, live: '' },
		{ label: 'AUDIO', value: '\u2014', live: 'audio' },
	];

	const linesHTML = lines
		.map((l) => {
			const attr = l.live ? ` data-visitor-${l.live}` : '';
			return `<span class="visitor-data__line"${attr}><span class="visitor-data__label">${l.label}</span><span class="visitor-data__value">${l.value}</span></span>`;
		})
		.join('');

	container.innerHTML =
		`<span class="visitor-data__header"><span><span class="visitor-data__dot"></span>MONITORING</span><span>${new Date().getFullYear()} L.N.</span></span>` +
		linesHTML +
		`<span class="visitor-data__footer">▸▸▹▹▸▹▸▸▹▸▸▹▹▸▸▹</span>`;
}

function updateLive(container) {
	const clockEl = container.querySelector('[data-visitor-clock]');
	if (clockEl) {
		clockEl.innerHTML = `<span class="visitor-data__label">SYS.TIME</span><span class="visitor-data__value">${formatTime(new Date())}</span>`;
	}
	const mouseEl = container.querySelector('[data-visitor-mouse]');
	if (mouseEl) {
		mouseEl.innerHTML = `<span class="visitor-data__label">CURSOR</span><span class="visitor-data__value">${mouseX}, ${mouseY}</span>`;
	}
}

// Called from main.js to update audio info
export function updateAudioDisplay(container, trackName, progress) {
	const audioEl = container?.querySelector('[data-visitor-audio]');
	if (!audioEl) return;
	const display = trackName ? `${trackName} ${(progress * 100).toFixed(0)}%` : '\u2014';
	audioEl.innerHTML = `<span class="visitor-data__label">AUDIO</span><span class="visitor-data__value">${display}</span>`;
}

function formatTime(d) {
	return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
