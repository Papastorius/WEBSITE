import * as THREE from '../libs/three.webgpu.min.js';
import gsap from '../libs/gsap-core.js';
import { GLTFLoader } from '../libs/addons/GLTFLoader.js';
import { PageLookControls } from './page-orbit-controls.js';
import { loadImmersiveContent } from './content-loader.js';
import { initPlayerAssets, initPlayerUI, setTimeSeconds, setTotalSeconds, updateProgress, setTrackIndex, updateEnvBar } from './audio/rnbo-player.js';
import { setMessRNBO, startAudioAndLoadRNBO } from './audio/rnbo-engine.js';
import { initVisitorData, updateAudioDisplay } from './visitor-data.js';
import { CSS3DRenderer, CSS3DObject } from '../libs/addons/CSS3DRenderer.js';

/* ---- Paths (no more WordPress wpData) ---- */
const PATHS = {
	models: './assets/models',
	rnbo: './assets/rnbo',
	libs: './assets/libs',
};
const ROOM_MODEL_FILE = 'website_room.glb';
const ROOM_MODEL_SCALE = 25;
const ROOM_DEBUG_BRIGHT_MATERIAL = false;
const BASE_CLEAR_COLOR = 0x07101a;
const BASE_FOG_COLOR = 0x0a1621;
const BASE_FOG_DENSITY = 0.0052;
const BASE_EXPOSURE = 1.05;
const ROOM_DEBUG_BRIGHT_MATERIAL_PROPS = {
	color: 0xf2f6f7,
	emissive: 0x5b6975,
	emissiveIntensity: 0.2,
	roughness: 0.92,
	metalness: 0.0,
};

const _isMobileEarly = window.innerWidth < 680;
const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, _isMobileEarly ? 1.2 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(BASE_CLEAR_COLOR, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = _isMobileEarly ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = BASE_EXPOSURE;
renderer.domElement.setAttribute('aria-hidden', 'true');
document.body.appendChild(renderer.domElement);

// CSS3D renderer — overlays HTML panels in 3D space
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(window.innerWidth, window.innerHeight);
cssRenderer.domElement.style.position = 'fixed';
cssRenderer.domElement.style.top = '0';
cssRenderer.domElement.style.left = '0';
cssRenderer.domElement.style.pointerEvents = 'auto';
cssRenderer.domElement.style.zIndex = '3';
cssRenderer.domElement.style.visibility = 'hidden';
document.body.appendChild(cssRenderer.domElement);

// Forward pointer events from CSS3D container to Three.js canvas
// when they don't hit a panel (allows camera drag on empty areas)
// Skip in explore mode — camera drag is handled by PageLookControls on document
let controls = null;
cssRenderer.domElement.addEventListener('pointerdown', (e) => {
	if (controls?.exploreMode) return;
	if (e.target === cssRenderer.domElement || !e.target.closest('.immersive-page__panel')) {
		cssRenderer.domElement.style.pointerEvents = 'none';
		const below = document.elementFromPoint(e.clientX, e.clientY);
		cssRenderer.domElement.style.pointerEvents = 'auto';
		if (below) below.dispatchEvent(new PointerEvent('pointerdown', e));
	}
});
cssRenderer.domElement.addEventListener('pointermove', (e) => {
	if (controls?.exploreMode) return;
	if (e.target === cssRenderer.domElement || !e.target.closest('.immersive-page__panel')) {
		cssRenderer.domElement.style.pointerEvents = 'none';
		const below = document.elementFromPoint(e.clientX, e.clientY);
		cssRenderer.domElement.style.pointerEvents = 'auto';
		if (below) below.dispatchEvent(new PointerEvent('pointermove', e));
	}
});
cssRenderer.domElement.addEventListener('pointerup', (e) => {
	if (controls?.exploreMode) return;
	if (e.target === cssRenderer.domElement || !e.target.closest('.immersive-page__panel')) {
		cssRenderer.domElement.style.pointerEvents = 'none';
		const below = document.elementFromPoint(e.clientX, e.clientY);
		cssRenderer.domElement.style.pointerEvents = 'auto';
		if (below) below.dispatchEvent(new PointerEvent('pointerup', e));
	}
});

// CSS3DRenderer uses preserve-3d which breaks z-index stacking.
// Move nav and player above the CSS3D layer by re-appending them to body
// after the CSS3D container, so they paint last.
const nav = document.querySelector('.immersive-nav');
const player = document.getElementById('rnbo-player');
const visitorData = document.querySelector('.visitor-data');
if (nav) document.body.appendChild(nav);
if (player) document.body.appendChild(player);
if (visitorData) document.body.appendChild(visitorData);

const cssScene = new THREE.Scene();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(BASE_FOG_COLOR, BASE_FOG_DENSITY);
const DEFAULT_FOG = scene.fog;
const MATRIX_FOG = new THREE.FogExp2(0x000000, 0.018);

const cameraViewsDesktop = {
	'page-accueil': {
		position: { x: 7.32, y: -10.4, z: 39.22 },
		rotation: { x: 0, y: -0.11, z: 0 },
	},
	'page-bio': {
		position: { x: -30, y: 25, z: 35 },
		rotation: { x: 0, y: 1.5, z: 0 },
	},
	'page-projets': {
		position: { x: 15, y: 10, z: 12 },
		rotation: { x: -0.08, y: -1.08, z: 0 },
	},
	'page-contact': {
		position: { x: -26.24, y: 3.78, z: 33 },
		rotation: { x: 0, y: 3.02, z: 0 },
	},
	'page-actus': {
		position: { x: -30, y: -15, z: -30 },
		rotation: { x: 0, y: 1.5, z: 0 },
	},
};

const cameraViewsMobile = {
	'page-accueil': {
		position: { x: 9.5, y: -28.36, z: 31 },
		rotation: { x: 0, y: 0.09, z: 0 },
	},
	'page-bio': {
		position: { x: -35.5, y: 25, z: 31.5 },
		rotation: { x: 0, y: 1.5, z: 0 },
	},
	'page-projets': {
		position: { x: 29, y: 10.5, z: 13.5 },
		rotation: { x: 0, y: -0.71, z: 0 },
	},
	'page-contact': {
		position: { x: -24.24, y: 3.78, z: 17 },
		rotation: { x: 0, y: 3.02, z: 0 },
	},
	'page-actus': {
		position: { x: -36, y: -14.5, z: -28.5 },
		rotation: { x: 0, y: 1.5, z: 0 },
	},
};

function getCameraViews() {
	return window.innerWidth < 680 ? cameraViewsMobile : cameraViewsDesktop;
}

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const initCamView = getCameraViews()['page-accueil'];
camera.position.set(initCamView.position.x, initCamView.position.y, initCamView.position.z);
scene.add(camera);

controls = new PageLookControls(camera, renderer.domElement);
controls.enableDamping = true;

// Wire up the mobile joystick — only does anything on touch devices
controls.initMobileJoystick(document.getElementById('mobile-joystick'));

const gltfLoader = new GLTFLoader().setPath(`${PATHS.models}/`);
const navLinks = document.querySelectorAll('#menu-3d a[data-target]');
const pages = document.querySelectorAll('.immersive-page');
const loadingScreen = document.querySelector('[data-loading-screen]');
const progressBar = document.querySelector('.immersive-loader__progress');
const sceneVideo = document.querySelector('[data-scene-video]');

let mesh;
let faceNormals = [];
let activeFace = -1;

let isDraggingMesh = false;
let lastX = 0;
let lastY = 0;

let rnboInitDone = false;
let device;
let targetSizeOcto = 1;
let glowTarget = 0;
let glowCurrent = 0;
let envTarget = 0;
let envCurrent = 0;
let videoPanel;
const videoPanelBaseRotation = { x: -0.04, y: -0.16 };
let particles;
const imagePanels = [];
let gridFloor;
const cssPanels = {};
const proxyMeshes = [];
const panelOpacity = {}; // { pageId: number } — opacité courante pour le fondu d'occlusion
const crtScreens = {}; // { pageId: THREE.Mesh } — écrans CRT pour le fondu d'occlusion
const crtAlbumPlanes = []; // planes d'albums attachés au CRT projets
let _cachedProjetsImgs = null; // cached querySelectorAll for perf
const _cachedPanelWorldPos = {}; // cached world positions for static panels
let activePageId = 'page-accueil';
let _isMobile = window.innerWidth < 680;

// World-space positions for CSS3D panels — placed in room openings
// Panel faces camera → rotation.y = camera rotation.y (not + PI)
const panelPlacements = {
	'page-bio': {
		// Camera (-8, 25, 20) rotY 1.5 → panel in left wall
		position: { x: -50, y: 25, z: 30 },
		rotation: { x: 0, y: 1.5, z: 0 },
	},
	'page-projets': {
		// Camera (20, 10, 12) rotY -1.08 → panel aligned in front
		position: { x: 38, y: 10, z: 3 },
		rotation: { x: 0, y: -1.08, z: 0 },
	},
	'page-contact': {
		// Camera (-26.24, 3.78, 33) rotY 3.02 → panel just in front
		position: { x: -26.24, y: 3.78, z: 31.5 },
		rotation: { x: 0, y: 3.02, z: 0 },
	},
	'page-actus': {
		// Same position as old accueil — in the room opening
		position: { x: -50, y: -15, z: -30 },
		rotation: { x: 0, y: 1.5, z: 0 },
	},
};

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const clock = new THREE.Clock();
const _camPos = new THREE.Vector3();
const _meshPos = new THREE.Vector3();
const _colorA = new THREE.Color(0xd72638);
const _colorB = new THREE.Color(0xff4444);
const _toCam = new THREE.Vector3();
const _meshWorldQ = new THREE.Quaternion();
const _parentWorldQ = new THREE.Quaternion();
const _invParentWorldQ = new THREE.Quaternion();
const _nWorld = new THREE.Vector3();

function createRoomDebugMaterial() {
	return new THREE.MeshStandardMaterial(ROOM_DEBUG_BRIGHT_MATERIAL_PROPS);
}

function applyRoomMaterial(child) {
	if (!child.isMesh) return;

	child.castShadow = true;
	child.receiveShadow = true;

	if (ROOM_DEBUG_BRIGHT_MATERIAL) {
		if (Array.isArray(child.material)) {
			child.material = child.material.map(() => createRoomDebugMaterial());
		} else {
			child.material = createRoomDebugMaterial();
		}
		return;
	}

	// Surfaces sombres — le contraste vient des spots, pas des matériaux
	if (Array.isArray(child.material)) {
		for (const mat of child.material) {
			if (mat?.color) mat.color.multiplyScalar(0.92);
			if (mat?.emissive) {
				mat.emissive.lerp(new THREE.Color(0x153247), 0.35);
				mat.emissiveIntensity = Math.max(mat.emissiveIntensity ?? 0, 0.08);
			}
		}
	} else if (child.material?.color) {
		child.material.color.multiplyScalar(0.92);
		if (child.material.emissive) {
			child.material.emissive.lerp(new THREE.Color(0x153247), 0.35);
			child.material.emissiveIntensity = Math.max(child.material.emissiveIntensity ?? 0, 0.08);
		}
	}
}

// ============================================================
// MOBILE SWIPE NAVIGATION
// ============================================================

const PAGE_ORDER = [
	'page-accueil',
	'page-bio',
	'page-projets',
	'page-actus',
	'page-contact',
];

const PAGE_LABELS = {
	'page-accueil': 'Accueil',
	'page-bio': 'À propos',
	'page-projets': 'Productions',
	'page-actus': 'Actus',
	'page-contact': 'Contact',
};

function updateMobileNav(pageId) {
	const dots = document.querySelectorAll('.mobile-page-dot');
	dots.forEach((dot) => {
		dot.classList.toggle('is-active', dot.dataset.target === pageId);
	});
	const bc = document.getElementById('mobile-breadcrumb');
	if (bc) bc.textContent = PAGE_LABELS[pageId] || '';
}

function mobileNavigateTo(pageId) {
	if (pageId === activePageId) return;
	setActivePage(pageId);
	setCamera(pageId);
}

function triggerSwipeFlash(side) {
	const el = document.getElementById(`swipe-flash-${side}`);
	if (!el) return;
	el.classList.add('is-flashing');
	setTimeout(() => el.classList.remove('is-flashing'), 200);
}

function initMobileNav() {
	const container = document.getElementById('mobile-page-dots');
	if (container) {
		PAGE_ORDER.forEach((pageId) => {
			const dot = document.createElement('button');
			dot.className = 'mobile-page-dot';
			dot.dataset.target = pageId;
			dot.setAttribute('aria-label', PAGE_LABELS[pageId]);
			dot.addEventListener('click', () => mobileNavigateTo(pageId));
			container.appendChild(dot);
		});
	}

	let touchStartX = 0;
	let touchStartY = 0;
	let touchStartTime = 0;
	const SWIPE_THRESHOLD = 30;
	const ANGLE_LIMIT = 55;
	const SWIPE_MAX_MS = 600;

	function onTouchStart(e) {
		if (!_isMobile) return;
		if (e.touches.length !== 1) return;
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		touchStartTime = Date.now();
	}

	let swipeHandled = false;

	function onTouchEnd(e) {
		if (!_isMobile) return;
		if (swipeHandled) return;
		if (e.changedTouches.length !== 1) return;
		if (Date.now() - touchStartTime > SWIPE_MAX_MS) return;

		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		const angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));
		if (angle > ANGLE_LIMIT && angle < 180 - ANGLE_LIMIT) return;
		if (Math.abs(dx) < SWIPE_THRESHOLD) return;

		swipeHandled = true;
		setTimeout(() => { swipeHandled = false; }, 100);

		const currentIndex = PAGE_ORDER.indexOf(activePageId);

		if (dx < 0) {
			const next = PAGE_ORDER[currentIndex + 1];
			if (next) {
				triggerSwipeFlash('left');
				mobileNavigateTo(next);
			}
		} else {
			const prev = PAGE_ORDER[currentIndex - 1];
			if (prev) {
				triggerSwipeFlash('right');
				mobileNavigateTo(prev);
			}
		}
	}

	[cssRenderer.domElement, renderer.domElement, document.body].forEach((el) => {
		el.addEventListener('touchstart', onTouchStart, { passive: true });
		el.addEventListener('touchend', onTouchEnd, { passive: true });
	});

	updateMobileNav(activePageId);
}

async function bootstrap() {
	const bootstrapStart = Date.now();
	const LOADER_MIN_MS = 2500;
	try {
		setProgress(10);

		await Promise.all([
			setupWorld().then(() => setProgress(50)),
			loadImmersiveContent().then(() => setProgress(70)),
			initPlayerAssets(PATHS.rnbo).then(() => setProgress(85)),
		]);

		setupLights();
		initPlayerUI();
		initVisitorData();
		setupCSSPanels();
		await buildCRTScreens();
		setupPanelScroll();
		initializeListeners();

		setProgress(95);
		await renderer.init();

		// Env map pour le clearcoat du dodecaèdre — après renderer.init()
		if (mesh) {
			const pmremGenerator = new THREE.PMREMGenerator(renderer);
			const fakeEnvScene = new THREE.Scene();
			fakeEnvScene.background = new THREE.Color(0x0d1e2e);
			const envRedLight = new THREE.PointLight(0xd72638, 3, 20);
			envRedLight.position.set(-5, 2, -3);
			const envTealLight = new THREE.PointLight(0x52c8e8, 2, 20);
			envTealLight.position.set(5, 5, 5);
			fakeEnvScene.add(envRedLight, envTealLight);
			const envRT = pmremGenerator.fromScene(fakeEnvScene);
			mesh.material.envMap = envRT.texture;
			mesh.material.envMapIntensity = 0.8;
			pmremGenerator.dispose();
		}

		window.addEventListener('resize', onWindowResize);
		initializeNavigation();
		initExploreMode();
		// Set home hint text based on device
		const homeHint = document.querySelector('[data-home-hint]');
		if (homeHint && _isMobile) homeHint.textContent = 'swiper pour découvrir';
		setActivePage(document.querySelector('.immersive-page.is-active')?.id ?? 'page-accueil');
		onWindowResize();
		controls.syncFromCamera();
		setProgress(100);
		animate();

	} catch (error) {
		console.error('Immersive bootstrap failed.', error);
		showBootError();
	} finally {
		const elapsed = Date.now() - bootstrapStart;
		const remaining = Math.max(0, LOADER_MIN_MS - elapsed);
		if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
		cssRenderer.domElement.style.visibility = 'visible';
		document.body.classList.add('immersive-ready');
		loadingScreen?.classList.add('is-hidden');
	}
}

function setProgress(percent) {
	if (progressBar) {
		progressBar.style.width = `${percent}%`;
	}
}

function setupPanelScroll() {
	// CSS3DObject moves panel elements out of their <section> into the CSS3D container,
	// and 3D transforms break native scroll. Forward wheel events to active panel.
	document.addEventListener('wheel', (e) => {
		const cssObj = cssPanels[activePageId];
		if (!cssObj) return;

		const panel = cssObj.element; // the actual DOM panel node
		if (!panel) return;

		// Scroll the panel itself first; if it can't scroll,
		// find the active tab content or inner scrollable area
		if (panel.scrollHeight > panel.clientHeight) {
			panel.scrollTop += e.deltaY;
		}
		// Also scroll any active tab content or inner content
		const activeTab = panel.querySelector('.projets-tab-content.is-active .immersive-page__content')
			|| panel.querySelector('.projets-tab-content.is-active [data-projets-creations]');
		const inner = activeTab || panel.querySelector('.immersive-page__content');
		if (inner && inner.scrollHeight > inner.clientHeight) {
			inner.scrollTop += e.deltaY;
		}
	}, { passive: true });
}

function initializeNavigation() {
	navLinks.forEach((link) => {
		link.addEventListener('click', (event) => {
			event.preventDefault();
			if (controls.exploreMode && link.id !== 'explore-toggle') return;
			const targetId = link.dataset.target;

			if (!targetId) {
				return;
			}

			setActivePage(targetId);
			setCamera(targetId);
		});

		// Text scramble on hover
		const originalText = link.textContent;
		const scrambleChars = '!@#$%^&*_+-=[]|;:<>?/~01';
		link.addEventListener('mouseenter', () => {
			let iteration = 0;
			const len = originalText.length;
			const interval = setInterval(() => {
				link.textContent = originalText
					.split('')
					.map((char, i) => {
						if (i < iteration) return originalText[i];
						return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
					})
					.join('');
				iteration += 1;
				if (iteration > len) {
					clearInterval(interval);
					link.textContent = originalText;
				}
			}, 30);
		});
	});

	initMobileNav();
}

function initExploreMode() {
	const btn = document.getElementById('explore-toggle');
	const hint = document.getElementById('explore-hint');
	if (!btn) return;

	btn.addEventListener('click', (e) => {
		e.preventDefault();
		controls.exploreMode = !controls.exploreMode;
		btn.classList.toggle('is-active', controls.exploreMode);
		btn.setAttribute('aria-pressed', String(controls.exploreMode));

		if (controls.exploreMode) {
			controls.syncFromCamera();
			document.body.classList.add('explore-active');
			cssRenderer.domElement.style.pointerEvents = 'none';
			if (cssPanels['page-accueil']) cssPanels['page-accueil'].visible = false;
			if (scene.userData.accProxy) scene.userData.accProxy.visible = false;
			// Remove distant/focused classes — let CRT distance system take over
			for (const [id, cssObj] of Object.entries(cssPanels)) {
				cssObj.element.classList.remove('panel--distant', 'panel--focused');
			}
			hint?.classList.add('is-visible');
			setTimeout(() => hint?.classList.remove('is-visible'), 4000);
		} else {
			controls.resetKeys();
			document.body.classList.remove('explore-active');
			cssRenderer.domElement.style.pointerEvents = 'auto';
			// Restore distant/focused classes based on active page
			for (const [id, cssObj] of Object.entries(cssPanels)) {
				cssObj.element.style.opacity = '';
				panelOpacity[id] = 1;
				if (id === 'page-accueil') continue;
				if (id === activePageId) {
					cssObj.element.classList.remove('panel--distant');
					cssObj.element.classList.add('panel--focused');
				} else {
					cssObj.element.classList.remove('panel--focused');
					cssObj.element.classList.add('panel--distant');
				}
			}
			if (activePageId === 'page-accueil') {
				if (cssPanels['page-accueil']) cssPanels['page-accueil'].visible = true;
				if (scene.userData.accProxy) scene.userData.accProxy.visible = true;
			}
			hint?.classList.remove('is-visible');
		}
	});

	// Disable explore mode when navigating via menu
	navLinks.forEach((link) => {
		link.addEventListener('click', () => {
			if (link.id === 'explore-toggle') return;
			controls.exploreMode = false;
			controls.resetKeys();
			btn.classList.remove('is-active');
			btn.setAttribute('aria-pressed', 'false');
			document.body.classList.remove('explore-active');
			cssRenderer.domElement.style.pointerEvents = 'auto';
			for (const [id, cssObj] of Object.entries(cssPanels)) {
				cssObj.element.style.opacity = '';
				panelOpacity[id] = 1;
			}
			hint?.classList.remove('is-visible');
		});
	});
}

function setActivePage(pageId) {
	activePageId = pageId;
	pages.forEach((page) => {
		page.classList.toggle('is-active', page.id === pageId);
	});

	navLinks.forEach((link) => {
		link.classList.toggle('is-active', link.dataset.target === pageId);
	});

	// Trigger glitch once on page title
	const title = document.querySelector(`#${pageId} .immersive-page__title`);
	if (title) {
		title.classList.remove('glitch-once');
		void title.offsetWidth; // force reflow
		title.classList.add('glitch-once');
	}

	// Accueil panel toggles with navigation, others stay always visible
	if (cssPanels['page-accueil']) {
		cssPanels['page-accueil'].visible = (pageId === 'page-accueil');
	}

	// Distant/focused state — inactive panels become dim silhouettes in the room
	for (const [id, cssObj] of Object.entries(cssPanels)) {
		if (id === 'page-accueil') continue;
		const el = cssObj.element;
		if (id === pageId) {
			el.classList.remove('panel--distant');
			el.classList.add('panel--focused');
		} else {
			el.classList.remove('panel--focused');
			el.classList.add('panel--distant');
		}
	}

	// Keep mobile nav in sync
	updateMobileNav(pageId);
}

function setCamera(targetId) {
	const view = getCameraViews()[targetId];
	if (!view) {
		return;
	}

	controls.enabled = false;

	const camDuration = _isMobile ? 1.8 : 1.45;

	gsap.to(camera.position, {
		...view.position,
		duration: camDuration,
		ease: 'power2.inOut',
	});

	gsap.to(camera.rotation, {
		...view.rotation,
		duration: camDuration,
		ease: 'power2.inOut',
		onComplete: () => {
			controls.syncFromCamera();
			controls.enabled = true;
		},
	});
}

async function setupWorld() {
	const glowMaterial = new THREE.MeshPhysicalMaterial({
		color: 0x1a1a1a,
		roughness: 0.3,
		metalness: 0.6,
		emissive: new THREE.Color(0xd72638),
		emissiveIntensity: 0,
		transparent: true,
		opacity: 1,
		clearcoat: 0.8,
		clearcoatRoughness: 0.2,
	});

	mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(4, 0), glowMaterial);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	scene.add(mesh);
	mesh.position.set(0, 5, 0);

	// Env map ajoutée après renderer.init() dans bootstrap()

	videoPanel = createVideoPanel();
	if (videoPanel) {
		// Place in world space — floating to the right, foreground
		videoPanel.position.set(isMobile() ? 0 : 15, -20, -20);
		scene.add(videoPanel);
	}


	buildFaceNormals();

	const salleLoaded = await gltfLoader.loadAsync(ROOM_MODEL_FILE);
	salleLoaded.scene.scale.setScalar(ROOM_MODEL_SCALE);
	salleLoaded.scene.traverse((child) => {
		applyRoomMaterial(child);
	});
	scene.add(salleLoaded.scene);

	// Collecter les meshes de la salle pour le raycast d'occlusion
	const salleMeshes = [];
	salleLoaded.scene.traverse((child) => {
		if (child.isMesh) salleMeshes.push(child);
	});
	scene.userData.salleMeshes = salleMeshes;

	createParticles();
	createGridFloor();
	createImagePanels();
}

function createImagePanel(imagePath, width, height, position, rotation, animConfig) {
	const textureLoader = new THREE.TextureLoader();
	const texture = textureLoader.load(imagePath);
	texture.colorSpace = THREE.SRGBColorSpace;

	// Frameless, semi-transparent — ghostly apparition, but casts shadows
	const mat = new THREE.MeshStandardMaterial({
		map: texture,
		transparent: true,
		opacity: 0,
		emissive: new THREE.Color(0xffffff),
		emissiveMap: texture,
		emissiveIntensity: 0,
		toneMapped: true,
		side: THREE.DoubleSide,
		depthWrite: false,
	});

	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
	mesh.position.copy(position);
	mesh.rotation.set(rotation.x, rotation.y, rotation.z);
	mesh.userData.anim = animConfig;
	mesh.userData.baseRotation = { x: rotation.x, y: rotation.y, z: rotation.z };
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	scene.add(mesh);
	imagePanels.push(mesh);
	return mesh;
}

function createImagePanels() {
	const mobile = isMobile();
	const s = mobile ? 0.6 : 1;

	// Photos du shooting uniquement — placées comme des apparitions

	// Near BIO — portrait debout
	createImagePanel(
		'uploads/2022/12/DSC00709-1024x1536-1-683x1024.jpg',
		5 * s, 7.5 * s,
		new THREE.Vector3(-20, 22, 15),
		{ x: 0, y: 1.2, z: 0 },
		{ sway: 0.02, speed: 0.15, phase: 0 }
	);
	// Near BIO — portrait face
	createImagePanel(
		'uploads/2022/12/DSC00734-1536x1024-1-768x512.jpg',
		8 * s, 5.3 * s,
		new THREE.Vector3(-15, 28, 25),
		{ x: -0.05, y: 1.8, z: 0 },
		{ sway: 0.025, speed: 0.12, phase: 1 }
	);

	// Near PROJETS — portrait assis profil
	createImagePanel(
		'uploads/2022/12/DSC00735-768x512.jpg',
		8 * s, 5.3 * s,
		new THREE.Vector3(25, 8, 5),
		{ x: 0, y: -1.3, z: 0 },
		{ sway: 0.02, speed: 0.18, phase: 2 }
	);

	if (!mobile) {
		// Near PROJETS — portrait buste
		createImagePanel(
			'uploads/2022/12/DSC00709-1024x1536-1.jpg',
			5, 7.5,
			new THREE.Vector3(20, 14, 18),
			{ x: -0.04, y: -0.8, z: 0 },
			{ sway: 0.015, speed: 0.14, phase: 3 }
		);
	}

	// Near CONTACT — portrait assis face
	createImagePanel(
		'uploads/2022/12/DSC00734-1536x1024-1.jpg',
		7 * s, 4.7 * s,
		new THREE.Vector3(-28, 6, -5),
		{ x: 0, y: 2.8, z: 0 },
		{ sway: 0.02, speed: 0.16, phase: 4 }
	);

	// Near ACCUEIL — portrait debout (grand, lointain)
	createImagePanel(
		'uploads/2022/12/DSC00735.jpg',
		9 * s, 6 * s,
		new THREE.Vector3(-15, -12, -38),
		{ x: 0, y: 1.6, z: 0 },
		{ sway: 0.018, speed: 0.13, phase: 5 }
	);

	if (!mobile) {
		// Near ACCUEIL — deuxième apparition
		createImagePanel(
			'uploads/2022/12/DSC00734-1536x1024-1-768x512.jpg',
			7, 4.7,
			new THREE.Vector3(5, -10, -35),
			{ x: 0, y: 2.0, z: -0.03 },
			{ sway: 0.02, speed: 0.2, phase: 6 }
		);
	}
}

function createVideoPanel() {
	if (!sceneVideo) {
		return null;
	}

	sceneVideo.muted = true;
	sceneVideo.loop = true;
	sceneVideo.playsInline = true;
	sceneVideo.play().catch(() => {});

	const videoTexture = new THREE.VideoTexture(sceneVideo);
	videoTexture.colorSpace = THREE.SRGBColorSpace;
	videoTexture.minFilter = THREE.LinearFilter;
	videoTexture.magFilter = THREE.LinearFilter;
	videoTexture.generateMipmaps = false;

	const ratio = 16 / 9;
	const width = 40;
	const height = width / ratio;
	const frameDepth = 0.4;
	const frameBorder = 0.35;

	const group = new THREE.Group();

	// Outer glow — neutral dark halo
	const glow = new THREE.Mesh(
		new THREE.PlaneGeometry(width + 3.5, height + 3.5),
		new THREE.MeshBasicMaterial({
			color: 0x0a0a0e,
			transparent: true,
			opacity: 0.5,
		})
	);
	glow.position.z = -(frameDepth / 2) - 0.1;

	// Frame — thick dark housing, like an old monitor casing
	const frame = new THREE.Mesh(
		new THREE.BoxGeometry(width + frameBorder * 2, height + frameBorder * 2, frameDepth),
		new THREE.MeshPhysicalMaterial({
			color: 0x111111,
			roughness: 0.8,
			metalness: 0.3,
			emissive: new THREE.Color(0x0a0a0a),
			emissiveIntensity: 0.1,
			clearcoat: 0.3,
			clearcoatRoughness: 0.5,
		})
	);

	// Edge highlight — subtle neutral border
	const edgeGeo = new THREE.BoxGeometry(
		width + frameBorder * 2 + 0.06,
		height + frameBorder * 2 + 0.06,
		frameDepth + 0.04
	);
	const edgeMat = new THREE.MeshBasicMaterial({
		color: 0x888888,
		transparent: true,
		opacity: 0.06,
	});
	const edge = new THREE.Mesh(edgeGeo, edgeMat);

	// Screen — video texture
	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry(width, height),
		new THREE.MeshBasicMaterial({
			map: videoTexture,
			toneMapped: false,
		})
	);
	screen.position.z = frameDepth / 2 + 0.01;

	// Screen light — dim glow from screen
	const screenLight = new THREE.PointLight(0x444448, 0.5, 12, 2);
	screenLight.position.set(0, 0, frameDepth / 2 + 1.5);

	frame.castShadow = true;
	frame.receiveShadow = true;
	screen.castShadow = true;

	group.add(glow, edge, frame, screen, screenLight);

	return group;
}

function createParticles() {
	const count = isMobile() ? 200 : 600;
	const positions = new Float32Array(count * 3);
	const spread = isMobile() ? 80 : 120;

	for (let i = 0; i < count; i++) {
		positions[i * 3] = (Math.random() - 0.5) * spread;
		positions[i * 3 + 1] = (Math.random() - 0.5) * spread;
		positions[i * 3 + 2] = (Math.random() - 0.5) * spread;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

	const material = new THREE.PointsMaterial({
		color: 0xd72638,
		size: 0.2,
		transparent: true,
		opacity: 0.3,
		sizeAttenuation: true,
	});

	particles = new THREE.Points(geometry, material);
	scene.add(particles);
}

function createGridFloor() {
	const size = 200;

	// Shadow-receiving ground plane
	const groundGeo = new THREE.PlaneGeometry(size, size);
	const groundMat = new THREE.ShadowMaterial({ opacity: 0.4 });
	const ground = new THREE.Mesh(groundGeo, groundMat);
	ground.rotation.x = -Math.PI / 2;
	ground.position.y = -25;
	ground.receiveShadow = true;
	scene.add(ground);
}

function isMobile() {
	return window.innerWidth < 680;
}

function setupCSSPanels() {
	// Attach camera to cssScene once (camera is already in main scene too)
	cssScene.add(camera);

	pages.forEach((page) => {
		const panel = page.querySelector('.immersive-page__panel');
		if (!panel) return;

		const pageId = page.id;
		const cssObject = new CSS3DObject(panel);

		if (pageId === 'page-accueil') {
			// Accueil panel attached to camera — visible on landing
			cssObject.position.set(-2, -1.5, -18);
			cssObject.rotation.y = 0.08;
			cssObject.scale.setScalar(getCSSPanelScale());
			cssObject.visible = page.classList.contains('is-active');
			camera.add(cssObject);
			cssPanels[pageId] = cssObject;

			// 3D slab proxy for accueil panel
			const s = getCSSPanelScale();
			const depth = 0.8;
			const accProxy = new THREE.Mesh(
				new THREE.BoxGeometry(1600 * s, 1600 * s, depth),
				new THREE.MeshPhysicalMaterial({
					color: 0x0a1520,
					roughness: 0.6,
					metalness: 0.4,
					transparent: true,
					opacity: 0.88,
					emissive: new THREE.Color(0x0a1828),
					emissiveIntensity: 0.15,
				})
			);
			accProxy.position.set(-2, -0.3, -18 - depth / 2);
			accProxy.rotation.y = 0.08;
			accProxy.castShadow = true;
			accProxy.receiveShadow = true;
			camera.add(accProxy);
			scene.userData.accProxy = accProxy;
			proxyMeshes.push(accProxy);
			return;
		}

		// Other panels — placed in room openings, always visible
		const placement = panelPlacements[pageId];
		if (!placement) return;

		const p = placement.position;
		const r = placement.rotation;
		cssObject.position.set(p.x, p.y, p.z);
		cssObject.rotation.set(r.x, r.y, r.z);
		cssObject.scale.setScalar(getCSSPanelScale());
		cssObject.visible = true;
		cssScene.add(cssObject);

		cssPanels[pageId] = cssObject;

		// 3D slab proxy — visible box behind the CSS3D panel
		const scale = getCSSPanelScale();
		const proxyW = 1600 * scale;
		const proxyH = 1600 * scale;
		const proxyDepth = 0.8;
		const proxyMat = new THREE.MeshPhysicalMaterial({
			color: 0x0a1520,
			roughness: 0.6,
			metalness: 0.4,
			transparent: true,
			opacity: 0.88,
			emissive: new THREE.Color(0x0a1828),
			emissiveIntensity: 0.15,
		});
		const proxy = new THREE.Mesh(
			new THREE.BoxGeometry(proxyW, proxyH, proxyDepth),
			proxyMat
		);
		// Offset slightly behind the CSS panel face
		const offset = new THREE.Vector3(0, 0, -proxyDepth / 2);
		offset.applyEuler(new THREE.Euler(r.x, r.y, r.z));
		proxy.position.set(p.x + offset.x, p.y + offset.y, p.z + offset.z);
		proxy.rotation.set(r.x, r.y, r.z);
		proxy.castShadow = (pageId !== 'page-contact');
		proxy.receiveShadow = true;
		scene.add(proxy);
		proxyMeshes.push(proxy);
	});
}

function getCSSPanelScale() {
	const w = window.innerWidth;
	if (w < 680) return 0.018;
	if (w < 980) return 0.016;
	return 0.02;
}

function updateCSSPanelLayout() {
	const s = getCSSPanelScale();
	for (const [id, cssObj] of Object.entries(cssPanels)) {
		cssObj.scale.setScalar(s);
		// Re-apply positions from placements in case of resize
		const p = panelPlacements[id];
		if (p) {
			cssObj.position.set(p.position.x, p.position.y, p.position.z);
			cssObj.rotation.set(p.rotation.x, p.rotation.y, p.rotation.z);
		}
	}
}

function setupLights() {
	// === AMBIANCE SOMBRE — très peu d'ambient pour garder les ombres profondes ===
	const ambient = new THREE.AmbientLight(0x1e3a4a, 0.6);

	// === HEMISPHERE — gradient ciel/sol bleu-teal ===
	const hemi = new THREE.HemisphereLight(0x3a5a70, 0x0d1a22, 0.5);

	// === KEY LIGHT — directional, shadow caster, follows camera ===
	const lightA = new THREE.DirectionalLight(0x7bc2e8, 2.4);
	lightA.position.set(10, 30, 10);
	lightA.castShadow = true;
	lightA.shadow.mapSize.width = _isMobile ? 1024 : 2048;
	lightA.shadow.mapSize.height = _isMobile ? 1024 : 2048;
	lightA.shadow.camera.near = 0.5;
	lightA.shadow.camera.far = 200;
	lightA.shadow.camera.left = -55;
	lightA.shadow.camera.right = 45;
	lightA.shadow.camera.top = 45;
	lightA.shadow.camera.bottom = -35;
	lightA.shadow.bias = -0.002;
	lightA.shadow.radius = 4;
	scene.userData.shadowLight = lightA;

	// === SPOT FENÊTRE DROITE — faisceau principal, lumière de fenêtre ===
	const windowSpotR = new THREE.SpotLight(0x73d6f3, 36, 300, Math.PI / 4, 0.78, 0.55);
	windowSpotR.position.set(40, 25, -10);
	windowSpotR.target.position.set(-5, -20, -15);
	windowSpotR.castShadow = true;
	windowSpotR.shadow.mapSize.width = 1024;
	windowSpotR.shadow.mapSize.height = 1024;
	windowSpotR.shadow.bias = -0.002;
	windowSpotR.shadow.radius = 6;
	scene.add(windowSpotR.target);

	// === SPOT FENÊTRE GAUCHE — faisceau secondaire, plus froid ===
	const windowSpotL = new THREE.SpotLight(0x60c6ea, 27, 280, Math.PI / 4, 0.8, 0.58);
	windowSpotL.position.set(-35, 20, -25);
	windowSpotL.target.position.set(5, -20, -20);
	windowSpotL.castShadow = true;
	windowSpotL.shadow.mapSize.width = 512;
	windowSpotL.shadow.mapSize.height = 512;
	windowSpotL.shadow.bias = -0.002;
	windowSpotL.shadow.radius = 4;
	scene.add(windowSpotL.target);

	// === SPOT ARRIÈRE — faisceau lointain, lumière teal froide ===
	const windowSpotBack = new THREE.SpotLight(0x69c8dd, 24, 350, Math.PI / 3.5, 0.82, 0.48);
	windowSpotBack.position.set(10, 30, -60);
	windowSpotBack.target.position.set(0, -10, -30);
	scene.add(windowSpotBack.target);

	// === SACRED TOP LIGHT — remonte le centre sans laver toute la salle ===
	const sanctumLight = new THREE.SpotLight(0xbfeeff, 26, 170, Math.PI / 6, 0.48, 0.9);
	sanctumLight.position.set(0, 32, 4);
	sanctumLight.target.position.set(0, 3, 6);
	scene.add(sanctumLight.target);

	// === ACCENT ROUGE — subtil, dans l'ombre, identité artistique ===
	const redPoint = new THREE.PointLight(0xd72638, 3.5, 120, 2);
	redPoint.position.set(0, 8, -10);

	// === LUEUR SOL — très subtile, bleu profond ===
	const floorGlow = new THREE.PointLight(0x2b5167, 1.0, 72, 2);
	floorGlow.position.set(0, -16, 4);

	// === ORBITING LIGHT — boule lumineuse, ton froid ===
	const orbitLight = new THREE.PointLight(0x9ad9e8, 15, 70, 2);
	orbitLight.castShadow = !_isMobile;
	orbitLight.shadow.mapSize.width = 512;
	orbitLight.shadow.mapSize.height = 512;
	orbitLight.shadow.radius = 4;
	orbitLight.shadow.bias = -0.002;

	// Sphère lumineuse visible
	const orbGeo = new THREE.SphereGeometry(0.3, 16, 16);
	const orbMat = new THREE.MeshBasicMaterial({ color: 0x9ad9e8 });
	const orbMesh = new THREE.Mesh(orbGeo, orbMat);
	orbitLight.add(orbMesh);

	scene.userData.orbitLight = orbitLight;
	scene.userData.redPoint = redPoint;

	// === GOD RAYS — cônes lumineux volumétriques fake (desktop only) ===
	if (!_isMobile) createGodRays();

	scene.add(ambient, hemi, lightA, windowSpotR, windowSpotL, windowSpotBack, sanctumLight,
		redPoint, floorGlow, orbitLight);
}

function createGodRays() {
	const rayMaterial = new THREE.MeshBasicMaterial({
		color: 0x1a6688,
		transparent: true,
		opacity: 0.055,
		side: THREE.DoubleSide,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
	});

	// Rayon 1 — large faisceau depuis la droite
	const ray1Geo = new THREE.ConeGeometry(12, 50, 16, 1, true);
	const ray1 = new THREE.Mesh(ray1Geo, rayMaterial);
	ray1.position.set(35, 5, -10);
	ray1.rotation.z = Math.PI / 3.5;
	ray1.rotation.y = -0.3;

	// Rayon 2 — faisceau plus étroit
	const ray2Geo = new THREE.ConeGeometry(8, 45, 12, 1, true);
	const ray2Mat = rayMaterial.clone();
	ray2Mat.opacity = 0.04;
	const ray2 = new THREE.Mesh(ray2Geo, ray2Mat);
	ray2.position.set(30, 8, -20);
	ray2.rotation.z = Math.PI / 4;
	ray2.rotation.y = -0.2;

	// Rayon 3 — depuis la gauche, plus subtil
	const ray3Geo = new THREE.ConeGeometry(10, 40, 12, 1, true);
	const ray3Mat = rayMaterial.clone();
	ray3Mat.opacity = 0.035;
	ray3Mat.color.set(0x155570);
	const ray3 = new THREE.Mesh(ray3Geo, ray3Mat);
	ray3.position.set(-30, 5, -25);
	ray3.rotation.z = -Math.PI / 3.5;
	ray3.rotation.y = 0.2;

	scene.userData.godRays = [ray1, ray2, ray3];
	scene.userData.godRaysBaseRot = [
		{ z: ray1.rotation.z, y: ray1.rotation.y },
		{ z: ray2.rotation.z, y: ray2.rotation.y },
		{ z: ray3.rotation.z, y: ray3.rotation.y },
	];
	scene.add(ray1, ray2, ray3);
}

function buildFaceNormals() {
	faceNormals = [];

	const geometry = mesh.geometry.index ? mesh.geometry.clone().toNonIndexed() : mesh.geometry.clone();
	const positions = geometry.attributes.position.array;
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();
	const normal = new THREE.Vector3();

	for (let index = 0; index < positions.length; index += 9) {
		a.set(positions[index], positions[index + 1], positions[index + 2]);
		b.set(positions[index + 3], positions[index + 4], positions[index + 5]);
		c.set(positions[index + 6], positions[index + 7], positions[index + 8]);

		normal.copy(b).sub(a).cross(c.clone().sub(a)).normalize();

		if (!faceNormals.some((faceNormal) => faceNormal.dot(normal) > 0.98)) {
			faceNormals.push(normal.clone());
		}
	}
}

function setNDC(event) {
	const rect = renderer.domElement.getBoundingClientRect();
	ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function hitMesh(event) {
	setNDC(event);
	raycaster.setFromCamera(ndc, camera);
	return raycaster.intersectObject(mesh, false).length > 0;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
	if (controls.exploreMode) return;
	if (!mesh || !hitMesh(event)) {
		return;
	}

	isDraggingMesh = true;
	lastX = event.clientX;
	lastY = event.clientY;
	controls.enabled = false;
	renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener('pointermove', (event) => {
	if (!isDraggingMesh) {
		return;
	}

	const dx = event.clientX - lastX;
	const dy = event.clientY - lastY;

	rotateMeshFromDrag(dx, dy);

	lastX = event.clientX;
	lastY = event.clientY;
});

renderer.domElement.addEventListener('pointerup', (event) => {
	if (!isDraggingMesh) {
		return;
	}

	isDraggingMesh = false;
	controls.enabled = true;
	renderer.domElement.releasePointerCapture?.(event.pointerId);
	snapToNearestFace();
});

renderer.domElement.addEventListener('pointercancel', () => {
	isDraggingMesh = false;
	controls.enabled = true;
});

function rotateMeshFromDrag(dx, dy) {
	const speed = 0.005;
	const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
	const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
	const qx = new THREE.Quaternion().setFromAxisAngle(camUp, dx * speed);
	const qy = new THREE.Quaternion().setFromAxisAngle(camRight, dy * speed);

	mesh.quaternion.premultiply(qx);
	mesh.quaternion.premultiply(qy);
}

function snapToNearestFace() {
	camera.updateMatrixWorld(true);
	mesh.updateMatrixWorld(true);

	camera.getWorldPosition(_camPos);
	mesh.getWorldPosition(_meshPos);
	_toCam.subVectors(_camPos, _meshPos).normalize();

	mesh.getWorldQuaternion(_meshWorldQ);

	let bestIndex = 0;
	let bestDot = -Infinity;

	for (let index = 0; index < faceNormals.length; index += 1) {
		_nWorld.copy(faceNormals[index]).applyQuaternion(_meshWorldQ).normalize();
		const dot = _nWorld.dot(_toCam);

		if (dot > bestDot) {
			bestDot = dot;
			bestIndex = index;
		}
	}

	snapToFace(bestIndex);
}

function snapToFace(faceIndex) {
	camera.updateMatrixWorld(true);
	mesh.updateMatrixWorld(true);

	camera.getWorldPosition(_camPos);
	mesh.getWorldPosition(_meshPos);
	_toCam.subVectors(_camPos, _meshPos).normalize();

	mesh.getWorldQuaternion(_meshWorldQ);

	const faceNormalWorld = faceNormals[faceIndex].clone().applyQuaternion(_meshWorldQ).normalize();
	const qSnapWorld = new THREE.Quaternion().setFromUnitVectors(faceNormalWorld, _toCam);
	const desiredWorldQ = qSnapWorld.multiply(_meshWorldQ);

	if (mesh.parent) {
		mesh.parent.getWorldQuaternion(_parentWorldQ);
		_invParentWorldQ.copy(_parentWorldQ).invert();
	} else {
		_invParentWorldQ.identity();
	}

	const desiredLocalQ = _invParentWorldQ.multiply(desiredWorldQ);
	const startQ = mesh.quaternion.clone();
	let factor = 0;

	function step() {
		factor += 0.15;
		mesh.quaternion.slerpQuaternions(startQ, desiredLocalQ, Math.min(factor, 1));

		if (factor < 1) {
			requestAnimationFrame(step);
			return;
		}

		triggerTrack(faceIndex);
	}

	step();
}

function triggerTrack(faceIndex) {
	if (faceIndex === activeFace) {
		return;
	}

	activeFace = faceIndex;
	setMessRNBO('next', 1);
}

function initializeListeners() {
	window.addEventListener('click', async () => {
		if (rnboInitDone) {
			return;
		}

		rnboInitDone = true;
		device = await startAudioAndLoadRNBO();

		if (device) {
			subscribeToMessages();
		}
	});
}

function subscribeToMessages() {
	device.messageEvent.subscribe((event) => {
		switch (event.tag) {
			case 'env':
				targetSizeOcto = THREE.MathUtils.mapLinear(event.payload, 0, 10, 1, 2);
				glowTarget = THREE.MathUtils.clamp(
					THREE.MathUtils.mapLinear(event.payload, 0, 10, 0, 0.15),
					0,
					10
				);
				envTarget = THREE.MathUtils.clamp(event.payload / 10, 0, 1);
				updateEnvBar(event.payload);
				break;

			case 'normTime':
				updateProgress(event.payload);
				// Update visitor terminal audio display
				updateAudioDisplay(
					document.querySelector('[data-visitor-data]'),
					'RNBO',
					event.payload
				);
				break;

			case 'seconds':
				setTimeSeconds(event.payload);
				break;

			case 'totalSeconds':
				setTotalSeconds(event.payload);
				break;

			case 'trackIndex':
				setTrackIndex(event.payload);
				break;

			default:
				break;
		}
	});
}

function onWindowResize() {
	const width = window.innerWidth;
	const height = window.innerHeight;

	const wasMobile = _isMobile;
	_isMobile = width < 680;
	camera.aspect = width / height;
	camera.updateProjectionMatrix();
	renderer.setSize(width, height);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	cssRenderer.setSize(width, height);
	updateCSSPanelLayout();

	// Re-position camera when crossing the mobile breakpoint
	if (wasMobile !== _isMobile) {
		setCamera(activePageId);
	}
}

function showBootError() {
	const contentNode = document.querySelector('#page-accueil [data-immersive-page-content]');
	if (!contentNode) {
		return;
	}

	contentNode.innerHTML =
		'<p class="immersive-error-message">Le chargement de la scène a échoué. Vérifie la console pour plus de détails.</p>';
}

// ─── CRT Terminal Screens — créés au même emplacement que les CSS3D panels ───

function createTerminalTexture(title, contentLines, concerts = []) {
	const W = 1024, H = 1280;
	const canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext('2d');

	const slug = (title || '').toLowerCase().replace(/\s+/g, '-');
	const m = 12;
	const iW = W - m * 2;
	const lh = 26; // line height — dense like F3
	const font = '"Geist Mono", monospace';
	const pad = 8; // left padding inside bg blocks

	// ── Fond semi-transparent — pas opaque, on voit la scène derrière ──
	ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
	ctx.fillRect(0, 0, W, H);

	// ── Helper: ligne key:value colorée ──
	let y = m + 6;
	function drawLine(label, value, labelColor, valueColor) {
		ctx.font = '700 20px ' + font;
		ctx.fillStyle = labelColor || '#888888';
		const labelStr = label + ': ';
		ctx.fillText(labelStr, m + pad, y);
		const lw = ctx.measureText(labelStr).width;
		ctx.font = '400 20px ' + font;
		ctx.fillStyle = valueColor || '#ffffff';
		ctx.fillText(value, m + pad + lw, y);
		y += lh;
	}

	function drawBlank() { y += lh * 0.4; }
	function drawSeparator() {
		ctx.fillStyle = 'rgba(215, 38, 56, 0.2)';
		ctx.fillRect(m + pad, y - lh * 0.3, iW * 0.6, 1);
		y += lh * 0.3;
	}

	// ── Section 1 : System info — comme F3 ──
	drawLine('page', '/' + slug, '#d72638', '#ffffff');
	drawLine('title', title || '—', '#888888', '#ffffff');
	drawLine('blocks', String(contentLines.length), '#888888', '#55ff55');
	drawLine('enc', 'utf-8', '#888888', '#55ff55');
	drawLine('render', 'three.webgpu r' + Math.floor(Math.random() * 170 + 160), '#888888', '#ffff55');
	drawLine('session', (crypto.randomUUID?.()?.slice(0, 8) || '--------').toUpperCase(), '#888888', '#55ffff');

	drawBlank();
	drawSeparator();
	drawBlank();

	// ── Section 2 : Contenu — texte brut, blanc, dense ──
	ctx.font = '400 20px ' + font;
	ctx.fillStyle = '#dddddd';
	const maxW = iW - pad * 2 - 10;

	for (const line of contentLines) {
		if (y > H - m - 20) {
			ctx.fillStyle = '#888888';
			ctx.fillText('... (' + (contentLines.length - contentLines.indexOf(line)) + ' more lines)', m + pad, y);
			break;
		}
		// Word wrap
		const words = line.split(' ');
		let cur = '';
		for (const word of words) {
			const test = cur + word + ' ';
			if (ctx.measureText(test).width > maxW && cur.length > 0) {
				ctx.fillStyle = '#dddddd';
				ctx.fillText(cur, m + pad, y);
				y += lh;
				cur = word + ' ';
				if (y > H - m - 20) break;
			} else {
				cur = test;
			}
		}
		if (y <= H - m - 20 && cur.length > 0) {
			ctx.fillStyle = '#dddddd';
			ctx.fillText(cur, m + pad, y);
			y += lh;
		}
		y += 4; // micro gap entre paragraphes
	}

	// ── Concerts — dates style F3 ──
	if (concerts.length > 0) {
		drawBlank();
		drawSeparator();
		drawBlank();

		// Header concerts
		ctx.font = '700 20px ' + font;
		ctx.fillStyle = '#d72638';
		ctx.fillText('UPCOMING [' + concerts.length + ']', m + pad, y);
		y += lh;

		const now = new Date();
		const upcoming = concerts
			.filter(c => new Date(c.start_datetime) >= now)
			.slice(0, 12); // max 12 pour pas dépasser

		for (const c of upcoming) {
			if (y > H - m - 100) {
				ctx.fillStyle = '#888888';
				ctx.fillText('... +' + (upcoming.length - upcoming.indexOf(c)) + ' dates', m + pad, y);
				y += lh;
				break;
			}
			const d = new Date(c.start_datetime);
			const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
			const loc = c.location?.split(',')[0] || c.salle || '—';

			// Date en vert, titre en blanc, lieu en jaune
			ctx.font = '700 20px ' + font;
			ctx.fillStyle = '#55ff55';
			const datePart = dateStr + ' ';
			ctx.fillText(datePart, m + pad, y);
			const dw = ctx.measureText(datePart).width;

			ctx.font = '400 20px ' + font;
			ctx.fillStyle = '#ffffff';
			const titlePart = c.title + ' ';
			ctx.fillText(titlePart, m + pad + dw, y);
			const tw = ctx.measureText(titlePart).width;

			ctx.fillStyle = '#ffff55';
			ctx.font = '400 18px ' + font;
			ctx.fillText(loc, m + pad + dw + tw, y);
			y += lh;
		}
	}

	// ── Cursor bloc — en bas du contenu ──
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(m + pad, y + 2, 12, 18);

	// ── Bottom — données brutes style F3 ──
	const bottomY = H - m - 80;
	ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
	ctx.fillRect(m, bottomY - 6, iW, 80);

	y = bottomY + 14;
	drawLine('pos', 'x:' + (Math.random() * 100 - 50).toFixed(1) + ' y:' + (Math.random() * 40).toFixed(1) + ' z:' + (Math.random() * 100 - 50).toFixed(1), '#888888', '#55ffff');
	drawLine('chunk', Math.floor(Math.random() * 16) + '/' + Math.floor(Math.random() * 16) + ' [' + slug + ']', '#888888', '#ffff55');
	drawLine('fps', Math.floor(Math.random() * 10 + 55) + ' (' + Math.floor(Math.random() * 5 + 12) + 'ms)', '#888888', '#55ff55');

	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

function extractPanelContent(cssObj) {
	const el = cssObj.element;
	const title = el.querySelector('.immersive-page__title')?.textContent?.trim() || '';
	const lines = [];
	const blocks = el.querySelectorAll('p, h3, h4, li, .concert-row');
	blocks.forEach(b => {
		const t = b.textContent?.trim();
		if (t) lines.push(t);
	});
	if (lines.length === 0) {
		const raw = el.querySelector('.immersive-page__content')?.textContent?.trim()
			|| el.querySelector('.panel-body')?.textContent?.trim() || '';
		if (raw) {
			const words = raw.split(/\s+/);
			let cur = '';
			for (const w of words) {
				if ((cur + ' ' + w).length > 80) { lines.push(cur.trim()); cur = w; }
				else cur += ' ' + w;
			}
			if (cur.trim()) lines.push(cur.trim());
		}
	}
	return { title, lines };
}

async function buildCRTScreens() {
	const texLoader = new THREE.TextureLoader();

	// Charger les concerts pour la page actus
	let concerts = [];
	try {
		const res = await fetch('./data/concerts.json');
		concerts = await res.json();
	} catch (e) { /* pas grave */ }

	for (const id of Object.keys(panelPlacements)) {
		const cssObj = cssPanels[id];
		if (!cssObj) continue;

		const { title, lines } = extractPanelContent(cssObj);
		const concertsForPage = (id === 'page-actus') ? concerts : [];
		const texture = createTerminalTexture(title, lines, concertsForPage);
		const placement = panelPlacements[id];
		const scale = getCSSPanelScale();
		const panelW = 1600 * scale;
		const panelH = 1600 * scale;

		const mat = new THREE.MeshStandardMaterial({
			map: texture,
			emissive: new THREE.Color(0xd72638),
			emissiveIntensity: 0.15,
			emissiveMap: texture,
			transparent: true,
			opacity: 0,
			side: THREE.FrontSide,
		});

		const plane = new THREE.Mesh(
			new THREE.PlaneGeometry(panelW, panelH),
			mat
		);
		const p = placement.position;
		const r = placement.rotation;
		const fwd = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(r.x, r.y, r.z));
		plane.position.set(p.x + fwd.x * 0.5, p.y + fwd.y * 0.5, p.z + fwd.z * 0.5);
		plane.rotation.set(r.x, r.y, r.z);
		scene.add(plane);
		crtScreens[id] = plane;

		// Albums sur le panneau projets
		if (id === 'page-projets') {
			const imgs = cssObj.element.querySelectorAll('.disco-item img');
			const artists = cssObj.element.querySelectorAll('.disco-item .disco-artist');
			const albumSize = panelW * 0.22;
			const cols = 4;
			const gap = albumSize * 0.15;
			const gridW = cols * albumSize + (cols - 1) * gap;
			const startX = -gridW / 2 + albumSize / 2;
			const startY = panelH * 0.15; // commence sous le header du CRT

			imgs.forEach((img, i) => {
				const col = i % cols;
				const row = Math.floor(i / cols);
				const localX = startX + col * (albumSize + gap);
				const localY = startY - row * (albumSize + gap);

				// Charger la cover
				const src = img.getAttribute('src');
				if (!src) return;

				const albumMat = new THREE.MeshStandardMaterial({
					color: 0xffffff,
					emissive: new THREE.Color(0x331111),
					emissiveIntensity: 0.2,
					transparent: true,
					opacity: 0,
					side: THREE.FrontSide,
				});

				const albumPlane = new THREE.Mesh(
					new THREE.PlaneGeometry(albumSize, albumSize),
					albumMat
				);

				// Positionner dans le repère local du CRT panel
				const euler = new THREE.Euler(r.x, r.y, r.z);
				const right = new THREE.Vector3(1, 0, 0).applyEuler(euler);
				const up = new THREE.Vector3(0, 1, 0).applyEuler(euler);
				const fwdSmall = new THREE.Vector3(0, 0, 1).applyEuler(euler);

				albumPlane.position.set(
					plane.position.x + right.x * localX + up.x * localY + fwdSmall.x * 0.15,
					plane.position.y + right.y * localX + up.y * localY + fwdSmall.y * 0.15,
					plane.position.z + right.z * localX + up.z * localY + fwdSmall.z * 0.15
				);
				albumPlane.rotation.set(r.x, r.y, r.z);

				scene.add(albumPlane);
				crtAlbumPlanes.push(albumPlane);

				// Label artiste sous la cover
				const artist = artists[i]?.textContent?.trim() || '';
				if (artist) {
					const labelCanvas = document.createElement('canvas');
					labelCanvas.width = 256;
					labelCanvas.height = 48;
					const lctx = labelCanvas.getContext('2d');
					lctx.fillStyle = '#050505';
					lctx.fillRect(0, 0, 256, 48);
					lctx.fillStyle = '#cccccc';
					lctx.font = '400 20px "Geist Mono", monospace';
					lctx.textAlign = 'center';
					lctx.fillText(artist, 128, 30);
					const labelTex = new THREE.CanvasTexture(labelCanvas);
					labelTex.colorSpace = THREE.SRGBColorSpace;

					const labelMat = new THREE.MeshStandardMaterial({
						map: labelTex,
						transparent: true,
						opacity: 0,
						side: THREE.FrontSide,
					});
					const labelH = albumSize * 0.18;
					const labelPlane = new THREE.Mesh(
						new THREE.PlaneGeometry(albumSize, labelH),
						labelMat
					);
					const labelOffset = -(albumSize / 2 + labelH / 2 + gap * 0.2);
					labelPlane.position.set(
						albumPlane.position.x + up.x * labelOffset,
						albumPlane.position.y + up.y * labelOffset,
						albumPlane.position.z + up.z * labelOffset
					);
					labelPlane.rotation.set(r.x, r.y, r.z);
					scene.add(labelPlane);
					crtAlbumPlanes.push(labelPlane);
				}

				// Charger la texture async
				texLoader.load(src, (tex) => {
					tex.colorSpace = THREE.SRGBColorSpace;
					albumMat.map = tex;
					albumMat.needsUpdate = true;
				});
			});
		}
	}
}

// ─── Matrix rain — se déclenche hors de la salle ───
const ROOM_BOUNDS = { minX: -55, maxX: 45, minY: -30, maxY: 40, minZ: -35, maxZ: 45 };
let matrixRain = null;
let matrixActive = false;

const MATRIX_CHARS =
	'ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ' +
	'0123456789ABCDEFZ<>+=*:;"(){}' +
	'ΣΩπφ日月火水木金土';

const MX_COL_W = 56;
const MX_COL_H = 1024;
const MX_FONT = 30;
const MX_PLANE_H = 190;
const MX_PLANE_W = MX_PLANE_H * (MX_COL_W / MX_COL_H);
const MX_LAYERS = [
	{
		count: _isMobile ? 4 : 14,
		radiusMin: 10,
		radiusMax: 20,
		ySpread: 16,
		scaleMin: 0.88,
		scaleMax: 1.04,
		opacity: 1.0,
		speedMin: 12,
		speedMax: 18,
		trailMin: 12,
		trailMax: 20,
		updateInterval: _isMobile ? 1 / 15 : 1 / 30,
	},
	{
		count: _isMobile ? 4 : 18,
		radiusMin: 22,
		radiusMax: 38,
		ySpread: 24,
		scaleMin: 0.98,
		scaleMax: 1.14,
		opacity: 0.82,
		speedMin: 9,
		speedMax: 14,
		trailMin: 10,
		trailMax: 17,
		updateInterval: _isMobile ? 1 / 10 : 1 / 20,
	},
	{
		count: _isMobile ? 3 : 16,
		radiusMin: 40,
		radiusMax: 62,
		ySpread: 30,
		scaleMin: 1.08,
		scaleMax: 1.24,
		opacity: 0.62,
		speedMin: 7,
		speedMax: 11,
		trailMin: 8,
		trailMax: 14,
		updateInterval: _isMobile ? 1 / 7 : 1 / 14,
	},
];

function randomMatrixChar() {
	return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
}

function placeMatrixStrip(strip, group, elapsed) {
	const angle = strip.baseAngle +
		Math.sin(elapsed * 0.11 + strip.phase) * 0.08 +
		elapsed * strip.angularVelocity;
	const radius = strip.baseRadius + Math.sin(elapsed * 0.21 + strip.phase * 1.7) * strip.radialDrift;
	const y = strip.baseY + Math.sin(elapsed * 0.31 + strip.phase) * strip.verticalDrift;

	strip.plane.position.set(
		Math.cos(angle) * radius,
		y,
		Math.sin(angle) * radius
	);
	strip.plane.quaternion.copy(camera.quaternion);
}

function createMatrixRain() {
	const group = new THREE.Group();
	group.visible = false;
	const strips = [];
	group.renderOrder = 40;
	const planeGeometry = new THREE.PlaneGeometry(MX_PLANE_W, MX_PLANE_H);

	for (let layerIndex = 0; layerIndex < MX_LAYERS.length; layerIndex++) {
		const layer = MX_LAYERS[layerIndex];

		for (let i = 0; i < layer.count; i++) {
			const canvas = document.createElement('canvas');
			canvas.width = MX_COL_W;
			canvas.height = MX_COL_H;
			const ctx = canvas.getContext('2d');
			ctx.clearRect(0, 0, MX_COL_W, MX_COL_H);

			const tex = new THREE.CanvasTexture(canvas);
			tex.minFilter = THREE.LinearFilter;
			tex.magFilter = THREE.LinearFilter;
			tex.generateMipmaps = false;
			tex.colorSpace = THREE.SRGBColorSpace;

			const mat = new THREE.MeshBasicMaterial({
				map: tex,
				transparent: true,
				opacity: 0,
				alphaTest: 0.04,
				depthWrite: false,
				depthTest: true,
				blending: THREE.NormalBlending,
				side: THREE.DoubleSide,
			});

			const plane = new THREE.Mesh(planeGeometry, mat);
			const angle = (i / layer.count) * Math.PI * 2 + (Math.random() - 0.5) * 0.22;
			const radius = THREE.MathUtils.lerp(layer.radiusMin, layer.radiusMax, Math.random());
			const y = (Math.random() - 0.5) * layer.ySpread;
			const scale = THREE.MathUtils.lerp(layer.scaleMin, layer.scaleMax, Math.random());
			plane.scale.setScalar(scale);
			group.add(plane);

			const fontSize = Math.round(MX_FONT * (0.9 + Math.random() * 0.28));
			const cellCount = Math.floor(MX_COL_H / fontSize);
			const strip = {
				canvas,
				ctx,
				tex,
				mat,
				plane,
				cellCount,
				fontSize,
				layerIndex,
				baseAngle: angle,
				baseRadius: radius,
				baseY: y,
				baseOpacity: layer.opacity * (0.82 + Math.random() * 0.16),
				phase: Math.random() * Math.PI * 2,
				angularVelocity: (Math.random() - 0.5) * 0.05,
				radialDrift: 0.6 + Math.random() * 1.8,
				verticalDrift: 0.8 + Math.random() * 2.6,
				headCell: Math.random() * cellCount,
				speedMin: layer.speedMin,
				speedMax: layer.speedMax,
				speed: THREE.MathUtils.lerp(layer.speedMin, layer.speedMax, Math.random()),
				trailMin: layer.trailMin,
				trailMax: layer.trailMax,
				trailLen: Math.floor(THREE.MathUtils.lerp(layer.trailMin, layer.trailMax, Math.random())),
				updateInterval: layer.updateInterval,
				drawAccumulator: Math.random() * layer.updateInterval,
				chars: Array.from({ length: cellCount }, () => randomMatrixChar()),
			};
			placeMatrixStrip(strip, group, 0);
			strips.push(strip);
		}
	}

	group.userData.strips = strips;
	group.userData.frame = 0;
	group.userData.opacity = 0;
	scene.add(group);
	return group;
}

function drawMatrixStrip(strip, delta) {
	const { ctx, canvas, tex, chars, cellCount, fontSize } = strip;
	const W = canvas.width, H = canvas.height;

	ctx.clearRect(0, 0, W, H);
	ctx.font = `700 ${fontSize}px "VT323", "Geist Mono", monospace`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	const head = Math.floor(strip.headCell);

	for (let t = strip.trailLen; t >= 0; t--) {
		const ci = head - t;
		if (ci < 0 || ci >= cellCount) continue;

		if (Math.random() < (t === 0 ? 1 : 0.08)) {
			chars[ci] = randomMatrixChar();
		}

		const y = ci * fontSize + fontSize * 0.52;

		if (t === 0) {
			if (!_isMobile) { ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(220, 255, 220, 0.95)'; }
			ctx.fillStyle = 'rgba(242, 255, 242, 0.98)';
		} else {
			const k = 1 - t / strip.trailLen;
			const alpha = 0.07 + k * 0.78;
			const r = Math.floor(6 + k * 18);
			const g = Math.floor(96 + k * 150);
			const b = Math.floor(10 + k * 26);
			if (!_isMobile) { ctx.shadowBlur = t < 3 ? 5 : 0; ctx.shadowColor = 'rgba(70, 255, 120, 0.32)'; }
			ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
		}

		ctx.fillText(chars[ci], W * 0.5, y);
	}

	ctx.shadowBlur = 0;
	if (Math.random() < 0.35) {
		const ghostCell = Math.floor(Math.random() * cellCount);
		ctx.fillStyle = `rgba(28, 120, 36, ${0.04 + Math.random() * 0.08})`;
		ctx.fillText(randomMatrixChar(), W * 0.5, ghostCell * fontSize + fontSize * 0.52);
	}

	strip.headCell += strip.speed * delta;
	if (strip.headCell - strip.trailLen > cellCount + 2) {
		strip.headCell = -Math.floor(Math.random() * (strip.trailLen * 0.75 + 6));
		strip.speed = THREE.MathUtils.lerp(strip.speedMin, strip.speedMax, Math.random());
		strip.trailLen = Math.floor(THREE.MathUtils.lerp(strip.trailMin, strip.trailMax, Math.random()));
	}
	tex.needsUpdate = true;
}

function isOutsideRoom(pos) {
	const b = ROOM_BOUNDS;
	const margin = 5;
	return pos.x < b.minX - margin || pos.x > b.maxX + margin ||
		pos.y < b.minY - margin || pos.y > b.maxY + margin ||
		pos.z < b.minZ - margin || pos.z > b.maxZ + margin;
}

function updateMatrixRain(elapsed, delta) {
	if (!controls.exploreMode) {
		if (matrixActive) {
			matrixActive = false;
			if (matrixRain) {
				matrixRain.userData.opacity = 0;
				matrixRain.userData.frame = 0;
				for (const s of matrixRain.userData.strips) s.mat.opacity = 0;
				matrixRain.visible = false;
			}
			scene.fog = DEFAULT_FOG;
			renderer.setClearColor(BASE_CLEAR_COLOR, 1);
			renderer.toneMappingExposure = BASE_EXPOSURE;
		}
		return;
	}

	const outside = isOutsideRoom(camera.position);

	if (outside && !matrixActive) {
		matrixActive = true;
		if (!matrixRain) matrixRain = createMatrixRain();
		matrixRain.visible = true;
		scene.fog = MATRIX_FOG;
		renderer.setClearColor(0x000000, 1);
		renderer.toneMappingExposure = 0.7;
	} else if (!outside && matrixActive) {
		matrixActive = false;
		scene.fog = DEFAULT_FOG;
		renderer.setClearColor(BASE_CLEAR_COLOR, 1);
		renderer.toneMappingExposure = BASE_EXPOSURE;
	}

	if (!matrixRain || !matrixRain.visible) return;

	// Fade
	const target = matrixActive ? 1.0 : 0;
	const cur = matrixRain.userData.opacity ?? 0;
	const op = cur + (target - cur) * 0.08;
	matrixRain.userData.opacity = op;
	for (const s of matrixRain.userData.strips) s.mat.opacity = op * s.baseOpacity;

	if (!matrixActive && op < 0.01) { matrixRain.visible = false; return; }

	// Centrer sur caméra
	matrixRain.position.copy(camera.position);

	// Les bandes proches bougent à chaque frame, les autres en alternance.
	matrixRain.userData.frame++;
	const strips = matrixRain.userData.strips;
	for (let i = 0; i < strips.length; i++) {
		const strip = strips[i];
		strip.drawAccumulator += delta;
		if (strip.drawAccumulator >= strip.updateInterval) {
			drawMatrixStrip(strip, strip.drawAccumulator);
			strip.drawAccumulator = 0;
		}
		placeMatrixStrip(strip, matrixRain, elapsed);
	}
}

// ─── Proximité + perturbation dodecaèdre : crossfade CSS3D → CRT ───
const _panelWorldPos = new THREE.Vector3();
const _meshWorldPos = new THREE.Vector3();

// Distances de crossfade (unités monde)
const CRT_NEAR = 25;  // full CSS3D en dessous — on lit le contenu
const CRT_FAR = 55;   // full CRT au-delà — respecte la 3D
// Rayon d'influence du dodecaèdre sur les panneaux
const DODECA_INFLUENCE = 20;

function updatePanelCrossfade(elapsed) {
	if (!controls.exploreMode) {
		// Hors explore : CSS3D à 100%, CRT invisible
		for (const [id, screen] of Object.entries(crtScreens)) {
			if (screen.material.opacity > 0.01) {
				screen.material.opacity *= 0.9;
			} else {
				screen.material.opacity = 0;
			}
		}
		// Album planes suivent le fade-out
		for (const ap of crtAlbumPlanes) {
			if (ap.material.opacity > 0.01) {
				ap.material.opacity *= 0.9;
			} else {
				ap.material.opacity = 0;
			}
		}
		for (const [id, cssObj] of Object.entries(cssPanels)) {
			if (id === 'page-accueil') continue;
			// Let CSS classes (panel--focused / panel--distant) handle opacity in normal mode
			cssObj.element.style.opacity = '';
			panelOpacity[id] = 1;
			// Reset child images opacity
			if (id === 'page-projets') {
				if (!_cachedProjetsImgs) _cachedProjetsImgs = cssObj.element.querySelectorAll('img');
				for (const img of _cachedProjetsImgs) {
					img.style.opacity = '';
				}
			}
		}
		return;
	}

	// Position du dodecaèdre
	let dodecaPos = null;
	if (mesh) {
		_meshWorldPos.setFromMatrixPosition(mesh.matrixWorld);
		dodecaPos = _meshWorldPos;
	}

	for (const [id, cssObj] of Object.entries(cssPanels)) {
		if (id === 'page-accueil') continue;
		if (!cssObj.visible) continue;

		if (!_cachedPanelWorldPos[id]) {
			_cachedPanelWorldPos[id] = new THREE.Vector3();
			cssObj.getWorldPosition(_cachedPanelWorldPos[id]);
		}
		_panelWorldPos.copy(_cachedPanelWorldPos[id]);

		// 1. Proximité caméra → panneau
		const camDist = camera.position.distanceTo(_panelWorldPos);
		// 0 = proche (full CSS3D lisible), 1 = loin (full CRT, respecte la 3D)
		const proxFactor = THREE.MathUtils.clamp(
			(camDist - CRT_NEAR) / (CRT_FAR - CRT_NEAR), 0, 1
		);

		// 2. Perturbation dodecaèdre — amplifie l'effet CRT
		let dodecaFactor = 0;
		if (dodecaPos) {
			const dodecaDist = dodecaPos.distanceTo(_panelWorldPos);
			dodecaFactor = 1 - THREE.MathUtils.clamp(
				dodecaDist / DODECA_INFLUENCE, 0, 1
			);
			dodecaFactor *= dodecaFactor; // courbe quadratique — montée rapide à proximité
		}

		// Combiner : proximité + boost du dodecaèdre
		const targetCRT = THREE.MathUtils.clamp(proxFactor + dodecaFactor * 0.5, 0, 1);

		// Lerp smooth
		if (panelOpacity[id] === undefined) panelOpacity[id] = 1;
		const currentCRT = 1 - panelOpacity[id];
		const newCRT = currentCRT + (targetCRT - currentCRT) * 0.06;
		panelOpacity[id] = 1 - newCRT;

		// Appliquer sur CSS3D — also force on child images (CSS3D preserve-3d breaks opacity cascade)
		const opStr = panelOpacity[id].toFixed(2);
		cssObj.element.style.opacity = opStr;
		if (id === 'page-projets') {
			if (!_cachedProjetsImgs) _cachedProjetsImgs = cssObj.element.querySelectorAll('img');
			for (const img of _cachedProjetsImgs) {
				img.style.opacity = opStr;
			}
		}

		// Appliquer sur CRT
		const screen = crtScreens[id];
		if (screen) {
			screen.material.opacity = newCRT;

			// Emissive de base + perturbation dodecaèdre
			const baseEmissive = 0.1 + newCRT * 0.1;
			// Flicker intensifié par le dodecaèdre
			const flickerAmt = dodecaFactor * 0.15;
			const flicker = flickerAmt > 0 ? (Math.random() - 0.5) * flickerAmt : 0;
			screen.material.emissiveIntensity = baseEmissive + flicker;

			// Sway légèrement le CRT screen
			const phase = id.length * 0.7;
			const base = panelPlacements[id];
			if (base) {
				const glitchY = dodecaFactor > 0.3
					? (Math.random() - 0.5) * dodecaFactor * 0.02
					: 0;
				screen.rotation.y = base.rotation.y + Math.sin(elapsed * 0.5 + phase) * 0.015 + glitchY;
				screen.rotation.x = (base.rotation.x || 0) + Math.cos(elapsed * 0.4 + phase) * 0.008;
			}

			// Album planes suivent l'opacité du CRT projets
			if (id === 'page-projets') {
				for (const ap of crtAlbumPlanes) {
					ap.material.opacity = newCRT;
				}
			}
		}
	}
}

function animate() {
	requestAnimationFrame(animate);
	const delta = Math.min(clock.getDelta(), 1 / 20);
	const elapsed = clock.elapsedTime;

	if (mesh) {
		glowCurrent += (glowTarget - glowCurrent) * 0.15;
		mesh.material.emissiveIntensity = glowCurrent;
		const colorBlend = THREE.MathUtils.clamp(glowCurrent / 6, 0, 1);

		mesh.material.emissive.lerpColors(_colorA, _colorB, colorBlend);
		mesh.scale.setScalar(targetSizeOcto);
	}

	if (videoPanel) {
		const mobile = _isMobile;
		const driftScale = mobile ? 0.5 : 1;
		videoPanel.position.x = (mobile ? 11 : 15) + Math.sin(elapsed * 0.05) * 5 * driftScale;
		videoPanel.position.y = (mobile ? -18 : 2) + Math.cos(elapsed * 0.04) * 3 * driftScale;
		videoPanel.position.z = (mobile ? -15 : -20) + Math.sin(elapsed * 0.03) * 4 * driftScale;
		// Subtle rotation
		videoPanel.rotation.y = Math.sin(elapsed * 0.06) * 0.2;
		videoPanel.rotation.x = Math.cos(elapsed * 0.05) * 0.08;
		videoPanel.rotation.z = Math.sin(elapsed * 0.04) * 0.04;
		const baseScale = mobile ? 1.0 : 2.5;
		videoPanel.scale.setScalar(baseScale + glowCurrent * (mobile ? 2 : 4));
	}

	// CSS3D panels — sway rotation + micro-jitter (desktop only — too expensive on mobile)
	if (!_isMobile) {
		for (const [id, cssObj] of Object.entries(cssPanels)) {
			if (!cssObj.visible) continue;
			const baseRotY = id === 'page-accueil' ? 0.08 : (panelPlacements[id]?.rotation.y ?? 0);
			const baseRotX = id === 'page-accueil' ? 0 : (panelPlacements[id]?.rotation.x ?? 0);
			const phase = id.length * 0.7;
			cssObj.rotation.y = baseRotY + Math.sin(elapsed * 0.5 + phase) * 0.04;
			cssObj.rotation.x = baseRotX + Math.cos(elapsed * 0.4 + phase) * 0.025;
		}
	}

	// Image panels — audio-reactive opacity, emissive & scale (every 2nd frame on mobile)
	if (!_isMobile || Math.round(elapsed * 30) % 2 === 0)
	for (const panel of imagePanels) {
		const a = panel.userData.anim;
		// Slow continuous rotation + sway (absolute, no accumulation)
		const br = panel.userData.baseRotation;
		panel.rotation.y = br.y + elapsed * 0.01 + Math.sin(elapsed * a.speed + a.phase) * a.sway;
		panel.rotation.x = br.x + Math.cos(elapsed * a.speed * 0.7 + a.phase) * a.sway * 0.5;
		panel.rotation.z = Math.sin(elapsed * a.speed * 0.5 + a.phase) * 0.06;
		// Opacity reacts to audio
		const phaseWave = Math.sin(elapsed * 0.3 + a.phase * 1.5) * 0.5 + 0.5;
		const targetOpacity = Math.min(0.5 + envCurrent * 3 * phaseWave, 1.0);
		panel.material.opacity += (targetOpacity - panel.material.opacity) * 0.15;
		// Emissive intensity pulses with audio
		panel.material.emissiveIntensity = 2.0 + envCurrent * 4.0;
		// Scale breathes with audio
		const baseScale = 1.0 + envCurrent * 0.15;
		panel.scale.setScalar(baseScale);
	}

	// Particles — red dots, audio-reactive like Nothing Phone LEDs
	if (particles) {
		particles.rotation.y = elapsed * 0.015;
		particles.rotation.x = Math.sin(elapsed * 0.008) * 0.1;
		particles.material.opacity = 0.1 + glowCurrent * 3;
		particles.material.size = 0.15 + glowCurrent * 1.2;
	}

	// Smooth audio envelope for lighting
	envCurrent += (envTarget - envCurrent) * 0.12;

	// Orbiting light — slow circle + audio-reactive intensity
	const ol = scene.userData.orbitLight;
	if (ol) {
		const radius = 30;
		const speed = 0.5;
		ol.position.set(
			Math.sin(elapsed * speed) * radius,
			15 + Math.sin(elapsed * speed * 0.7) * 10,
			Math.cos(elapsed * speed) * radius
		);
		ol.intensity = 15 + envCurrent * 18;
	}

	// God rays — slow drift rotation + breathing + audio-reactive opacity
	const rays = scene.userData.godRays;
	const raysBase = scene.userData.godRaysBaseRot;
	if (rays && raysBase) {
		const driftSpeeds = [0.07, 0.09, 0.08];
		const driftAmountsZ = [0.08, 0.06, 0.07];
		const driftAmountsY = [0.04, 0.03, 0.05];
		const baseOpacities = [0.07, 0.052, 0.042];
		for (let i = 0; i < rays.length; i++) {
			// Slow drift — feels like dust shifting in light
			const sinT = Math.sin(elapsed * driftSpeeds[i] + i * 2.0);
			const cosT = Math.cos(elapsed * driftSpeeds[i] * 0.8 + i * 1.5);
			rays[i].rotation.z = raysBase[i].z + sinT * driftAmountsZ[i];
			rays[i].rotation.y = raysBase[i].y + cosT * driftAmountsY[i];

			// Opacity: breathing + audio
			const breath = Math.sin(elapsed * 0.15 + i * 1.2) * 0.3 + 0.7;
			rays[i].material.opacity = baseOpacities[i] * breath + envCurrent * 0.06;
		}
	}

	// Red point light — pulse with audio
	const rp = scene.userData.redPoint;
	if (rp) {
		const heartbeat = 0.6 + Math.sin(elapsed * 1.2) * 0.2 + Math.sin(elapsed * 2.1) * 0.1;
		rp.intensity = heartbeat + envCurrent * 4;
	}

	// Shadow light follows camera so shadows stay relevant (only when camera moves)
	const sl = scene.userData.shadowLight;
	if (sl) {
		const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
		if (sl._lx !== cx || sl._ly !== cy || sl._lz !== cz) {
			sl.position.set(cx + 25, cy + 35, cz + 10);
			sl.target.position.copy(camera.position);
			sl.target.updateMatrixWorld();
			sl._lx = cx; sl._ly = cy; sl._lz = cz;
		}
	}

	// Crossfade proximité CSS3D → CRT + perturbation dodecaèdre
	updatePanelCrossfade(elapsed);

	// Matrix rain — hors de la salle
	updateMatrixRain(elapsed, delta);

	controls.update();
	renderer.render(scene, camera);
	cssRenderer.render(cssScene, camera);
}

function initCameraDebug() {
	if (!new URLSearchParams(location.search).has('debug')) return;

	const views = getCameraViews();
	const axes = [
		{ key: 'x',    target: 'position', min: -80,  max: 80,  step: 0.02   },
		{ key: 'y',    target: 'position', min: -40,  max: 80,  step: 0.02   },
		{ key: 'z',    target: 'position', min: -80,  max: 80,  step: 0.02   },
		{ key: 'rotY', target: 'rotation', min: -3.2, max: 3.2, step: 0.0002 },
	];

	const panel = document.createElement('div');
	panel.style.cssText = `
		position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
		background: rgba(0,0,0,0.88); color: #fff; font-family: monospace;
		font-size: 13px; padding: 12px 16px; border-radius: 8px;
		border: 1px solid #555; z-index: 9999; width: 310px;
	`;

	const title = document.createElement('div');
	title.style.cssText = 'color:#d72638; margin-bottom:10px; font-size:12px;';
	panel.appendChild(title);

	const sliders = {};
	const valEls = {};

	axes.forEach(({ key, min, max, step }) => {
		const row = document.createElement('div');
		row.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:6px;';

		const lbl = document.createElement('span');
		lbl.style.cssText = 'width:40px; color:#aaa;';
		lbl.textContent = key;

		const slider = document.createElement('input');
		slider.type = 'range';
		slider.min = min; slider.max = max; slider.step = step;
		slider.style.cssText = 'flex:1; accent-color:#d72638;';
		sliders[key] = slider;

		const val = document.createElement('span');
		val.style.cssText = 'width:46px; text-align:right; color:#d72638;';
		valEls[key] = val;

		slider.addEventListener('input', () => {
			const v = parseFloat(slider.value);
			val.textContent = v.toFixed(2);
			const view = views[activePageId];
			if (!view) return;
			if (key === 'rotY') {
				view.rotation.y = v;
				camera.rotation.y = v;
				controls.syncFromCamera();
			} else {
				view.position[key] = v;
				camera.position[key] = v;
			}
		});

		row.append(lbl, slider, val);
		panel.appendChild(row);
	});

	const copyBtn = document.createElement('button');
	copyBtn.textContent = 'Copier les valeurs';
	copyBtn.style.cssText = `
		margin-top:8px; width:100%; padding:7px; background:#d72638;
		color:#fff; border:none; border-radius:4px; font-family:monospace;
		font-size:12px; cursor:pointer;
	`;
	copyBtn.addEventListener('click', () => {
		const view = views[activePageId];
		if (!view) return;
		const { x, y, z } = view.position;
		const ry = view.rotation.y;
		const txt = `'${activePageId}': {\n\tposition: { x: ${x}, y: ${y}, z: ${z} },\n\trotation: { x: 0, y: ${ry.toFixed(2)}, z: 0 },\n},`;
		navigator.clipboard?.writeText(txt).then(() => {
			copyBtn.textContent = 'Copié !';
			setTimeout(() => (copyBtn.textContent = 'Copier les valeurs'), 1500);
		});
	});
	panel.appendChild(copyBtn);
	document.body.appendChild(panel);

	// Sync sliders quand la page active change
	let lastPage = null;
	const sync = () => {
		if (activePageId !== lastPage) {
			lastPage = activePageId;
			title.textContent = '📷 ' + activePageId;
			const view = views[activePageId];
			if (view) {
				const range = 10, rangeR = 0.3;
				sliders.x.min = view.position.x - range;  sliders.x.max = view.position.x + range;
				sliders.y.min = view.position.y - range;  sliders.y.max = view.position.y + range;
				sliders.z.min = view.position.z - range;  sliders.z.max = view.position.z + range;
				sliders.rotY.min = view.rotation.y - rangeR; sliders.rotY.max = view.rotation.y + rangeR;
				sliders.x.value    = view.position.x;
				sliders.y.value    = view.position.y;
				sliders.z.value    = view.position.z;
				sliders.rotY.value = view.rotation.y;
				valEls.x.textContent    = view.position.x.toFixed(2);
				valEls.y.textContent    = view.position.y.toFixed(2);
				valEls.z.textContent    = view.position.z.toFixed(2);
				valEls.rotY.textContent = view.rotation.y.toFixed(2);
			}
		}
		requestAnimationFrame(sync);
	};
	sync();
}

await bootstrap();
initCameraDebug();
