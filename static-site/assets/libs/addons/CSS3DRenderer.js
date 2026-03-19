/**
 * CSS3DRenderer — adapted for local Three.js WebGPU bundle import.
 * Based on Three.js r181 addons/renderers/CSS3DRenderer.js
 */

import { Matrix4, Object3D, Quaternion, Vector3 } from '../../libs/three.webgpu.min.js';

const _position = new Vector3();
const _quaternion = new Quaternion();
const _scale = new Vector3();

class CSS3DObject extends Object3D {
	constructor(element = document.createElement('div')) {
		super();
		this.isCSS3DObject = true;
		this.element = element;
		this.element.style.position = 'absolute';
		this.element.style.pointerEvents = 'auto';
		this.element.style.userSelect = 'none';
		this.element.setAttribute('draggable', false);

		this.addEventListener('removed', function () {
			this.traverse(function (object) {
				if (
					object.element &&
					object.element instanceof object.element.ownerDocument.defaultView.Element &&
					object.element.parentNode !== null
				) {
					object.element.remove();
				}
			});
		});
	}

	copy(source, recursive) {
		super.copy(source, recursive);
		this.element = source.element.cloneNode(true);
		return this;
	}
}

const _matrix = new Matrix4();
const _matrix2 = new Matrix4();

class CSS3DRenderer {
	constructor(parameters = {}) {
		const _this = this;
		let _width, _height;
		let _widthHalf, _heightHalf;

		const cache = {
			camera: { style: '' },
			objects: new WeakMap(),
		};

		const domElement = parameters.element !== undefined ? parameters.element : document.createElement('div');
		domElement.style.overflow = 'hidden';
		this.domElement = domElement;

		const viewElement = document.createElement('div');
		viewElement.style.transformOrigin = '0 0';
		viewElement.style.pointerEvents = 'none';
		domElement.appendChild(viewElement);

		const cameraElement = document.createElement('div');
		cameraElement.style.transformStyle = 'preserve-3d';
		viewElement.appendChild(cameraElement);

		this.getSize = function () {
			return { width: _width, height: _height };
		};

		this.render = function (scene, camera) {
			const fov = camera.projectionMatrix.elements[5] * _heightHalf;

			if (camera.view && camera.view.enabled) {
				viewElement.style.transform =
					`translate(${-camera.view.offsetX * (_width / camera.view.width)}px, ${-camera.view.offsetY * (_height / camera.view.height)}px)`;
				viewElement.style.transform +=
					`scale(${camera.view.fullWidth / camera.view.width}, ${camera.view.fullHeight / camera.view.height})`;
			} else {
				viewElement.style.transform = '';
			}

			if (scene.matrixWorldAutoUpdate === true) scene.updateMatrixWorld();
			if (camera.parent === null && camera.matrixWorldAutoUpdate === true) camera.updateMatrixWorld();

			let tx, ty;
			if (camera.isOrthographicCamera) {
				tx = -(camera.right + camera.left) / 2;
				ty = (camera.top + camera.bottom) / 2;
			}

			const scaleByViewOffset = camera.view && camera.view.enabled ? camera.view.height / camera.view.fullHeight : 1;
			const cameraCSSMatrix = camera.isOrthographicCamera
				? `scale(${scaleByViewOffset})scale(${fov})translate(${epsilon(tx)}px,${epsilon(ty)}px)${getCameraCSSMatrix(camera.matrixWorldInverse)}`
				: `scale(${scaleByViewOffset})translateZ(${fov}px)${getCameraCSSMatrix(camera.matrixWorldInverse)}`;
			const perspective = camera.isPerspectiveCamera ? `perspective(${fov}px) ` : '';

			const style = perspective + cameraCSSMatrix + `translate(${_widthHalf}px,${_heightHalf}px)`;

			if (cache.camera.style !== style) {
				cameraElement.style.transform = style;
				cache.camera.style = style;
			}

			renderObject(scene, scene, camera, cameraCSSMatrix);
		};

		this.setSize = function (width, height) {
			_width = width;
			_height = height;
			_widthHalf = _width / 2;
			_heightHalf = _height / 2;

			domElement.style.width = width + 'px';
			domElement.style.height = height + 'px';
			viewElement.style.width = width + 'px';
			viewElement.style.height = height + 'px';
			cameraElement.style.width = width + 'px';
			cameraElement.style.height = height + 'px';
		};

		function epsilon(value) {
			return Math.abs(value) < 1e-10 ? 0 : value;
		}

		function getCameraCSSMatrix(matrix) {
			const e = matrix.elements;
			return (
				'matrix3d(' +
				epsilon(e[0]) + ',' + epsilon(-e[1]) + ',' + epsilon(e[2]) + ',' + epsilon(e[3]) + ',' +
				epsilon(e[4]) + ',' + epsilon(-e[5]) + ',' + epsilon(e[6]) + ',' + epsilon(e[7]) + ',' +
				epsilon(e[8]) + ',' + epsilon(-e[9]) + ',' + epsilon(e[10]) + ',' + epsilon(e[11]) + ',' +
				epsilon(e[12]) + ',' + epsilon(-e[13]) + ',' + epsilon(e[14]) + ',' + epsilon(e[15]) +
				')'
			);
		}

		function getObjectCSSMatrix(matrix) {
			const e = matrix.elements;
			const m = 'matrix3d(' +
				epsilon(e[0]) + ',' + epsilon(e[1]) + ',' + epsilon(e[2]) + ',' + epsilon(e[3]) + ',' +
				epsilon(-e[4]) + ',' + epsilon(-e[5]) + ',' + epsilon(-e[6]) + ',' + epsilon(-e[7]) + ',' +
				epsilon(e[8]) + ',' + epsilon(e[9]) + ',' + epsilon(e[10]) + ',' + epsilon(e[11]) + ',' +
				epsilon(e[12]) + ',' + epsilon(e[13]) + ',' + epsilon(e[14]) + ',' + epsilon(e[15]) +
				')';
			return 'translate(-50%,-50%)' + m;
		}

		function hideObject(object) {
			if (object.isCSS3DObject) object.element.style.display = 'none';
			for (let i = 0, l = object.children.length; i < l; i++) {
				hideObject(object.children[i]);
			}
		}

		function renderObject(object, scene, camera) {
			if (object.visible === false) {
				hideObject(object);
				return;
			}

			if (object.isCSS3DObject) {
				const visible = object.layers.test(camera.layers) === true;
				const element = object.element;
				element.style.display = visible === true ? '' : 'none';

				if (visible === true) {
					object.onBeforeRender(_this, scene, camera);
					const style = getObjectCSSMatrix(object.matrixWorld);

					const cachedObject = cache.objects.get(object);
					if (cachedObject === undefined || cachedObject.style !== style) {
						element.style.transform = style;
						cache.objects.set(object, { style });
					}

					if (element.parentNode !== cameraElement) {
						cameraElement.appendChild(element);
					}

					object.onAfterRender(_this, scene, camera);
				}
			}

			for (let i = 0, l = object.children.length; i < l; i++) {
				renderObject(object.children[i], scene, camera);
			}
		}
	}
}

export { CSS3DObject, CSS3DRenderer };
