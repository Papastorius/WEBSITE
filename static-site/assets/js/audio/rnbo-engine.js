let audioContext;
let device;
let patcher;
let dependencies;
let audioContextStarted = false;
let rnboAssetsReady = false;

function toAbsoluteDependencyPath(dependency, dependenciesURL) {
	const base = dependenciesURL.startsWith('http')
		? dependenciesURL
		: new URL(dependenciesURL, window.location.href).toString();
	const mediaDirectory = new URL('./', base);
	const filename = String(dependency?.file ?? '')
		.split(/[\\/]/)
		.pop();

	if (!filename) {
		return dependency;
	}

	return {
		...dependency,
		file: new URL(filename, mediaDirectory).toString(),
	};
}

function getRNBOApi() {
	if (!window.RNBO) {
		throw new Error('RNBO global is not available.');
	}

	return window.RNBO;
}

export async function initRNBOPlayer(patcherURL, dependenciesURL) {
	const [patcherResponse, dependenciesResponse] = await Promise.all([
		fetch(patcherURL),
		fetch(dependenciesURL),
	]);

	if (!patcherResponse.ok || !dependenciesResponse.ok) {
		throw new Error('Unable to load RNBO assets.');
	}

	patcher = await patcherResponse.json();
	dependencies = (await dependenciesResponse.json()).map((dependency) =>
		toAbsoluteDependencyPath(dependency, dependenciesURL)
	);
	rnboAssetsReady = true;
}

export function startAudioContext() {
	if (audioContextStarted) {
		return audioContext;
	}

	audioContext = new (window.AudioContext || window.webkitAudioContext)();
	audioContextStarted = true;

	return audioContext;
}

export async function startRNBOPlayer() {
	if (device) {
		return device;
	}

	if (!rnboAssetsReady) {
		throw new Error('RNBO assets must be initialized before the device starts.');
	}

	const context = startAudioContext();
	const { createDevice } = getRNBOApi();

	device = await createDevice({
		context,
		patcher,
	});

	device.node.connect(context.destination);
	await device.loadDataBufferDependencies(dependencies);

	return device;
}

export async function startAudioAndLoadRNBO() {
	try {
		const context = startAudioContext();

		if (context.state === 'suspended') {
			await context.resume();
		}

		return startRNBOPlayer();
	} catch (error) {
		console.error('RNBO startup failed.', error);
		return null;
	}
}

export function setMessRNBO(eventName, value) {
	if (!device) {
		return;
	}

	const { MessageEvent, TimeNow } = getRNBOApi();
	const event = new MessageEvent(TimeNow, eventName, [value]);
	device.scheduleEvent(event);
}

export function setParamRNBO(paramName, alternateValue) {
	if (!device) {
		return;
	}

	const parameter = device.parametersById.get(paramName);
	if (!parameter) {
		return;
	}

	parameter.value = alternateValue;
}
