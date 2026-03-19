import * as THREE from '../libs/three.webgpu.min.js';

const _direction = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

class PageLookControls {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.enabled = true;
    this.exploreMode = false;
    this.moveSpeed = 0.4;

    this.yaw = 0;
    this.pitch = 0;

    this.minPitch = -1.2;
    this.maxPitch =  1.2;

    this.rotateSpeed = 0.005;

    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;

    // Movement keys state
    this._keys = { forward: false, back: false, left: false, right: false, up: false, down: false };

    this._onPointerDown = (e) => {
      if (!this.enabled || !this.exploreMode) return;
      // Don't start a camera drag when the user touches the joystick ring
      if (e.target.closest("#menu-3d") || e.target.closest("#rnbo-player") || e.target.closest(".explore-hint") || e.target.closest(".mobile-joystick")) return;

      this._dragging = true;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
    };

    this._onPointerMove = (e) => {
      if (!this.enabled || !this._dragging) return;

      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;

      this.yaw   -= dx * this.rotateSpeed;
      this.pitch -= dy * this.rotateSpeed;
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    };

    this._onPointerUp = () => { this._dragging = false; };

    this._onKeyDown = (e) => {
      if (!this.exploreMode) return;
      if (this._setKey(e.code, true)) e.preventDefault();
    };

    this._onKeyUp = (e) => {
      this._setKey(e.code, false);
    };

    // Listen on document to avoid CSS3D layer blocking events
    document.addEventListener("pointerdown", this._onPointerDown, { passive: true });
    document.addEventListener("pointermove", this._onPointerMove, { passive: true });
    document.addEventListener("pointerup", this._onPointerUp, { passive: true });
    document.addEventListener("pointercancel", this._onPointerUp, { passive: true });

    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  _setKey(code, pressed) {
    switch (code) {
      case 'KeyW': case 'ArrowUp':    this._keys.forward = pressed; return true;
      case 'KeyS': case 'ArrowDown':  this._keys.back    = pressed; return true;
      case 'KeyA': case 'ArrowLeft':  this._keys.left    = pressed; return true;
      case 'KeyD': case 'ArrowRight': this._keys.right   = pressed; return true;
      case 'Space':                   this._keys.up      = pressed; return true;
      case 'ShiftLeft': case 'ShiftRight': this._keys.down = pressed; return true;
    }
    return false;
  }

  // ---- Mobile joystick ----
  // Call this once after the DOM is ready.
  // It attaches touch listeners to the joystick ring and sets _keys
  // using the same booleans that WASD uses — no changes needed to update().
  initMobileJoystick(ringEl) {
    if (!ringEl) return;

    this._joystickRing = ringEl;
    this._joystickKnob = ringEl.querySelector('.mobile-joystick__knob');

    // How far the knob can travel from center before it clips (half of ring - half of knob)
    const MAX_RADIUS = 34; // px — tuned to a 96px ring with a 28px knob

    // Active touch identifier — we only track one finger on the joystick
    let joystickTouchId = null;

    // Center of the ring in page coordinates (recalculated on each touch start)
    let originX = 0;
    let originY = 0;

    const onTouchStart = (e) => {
      // Only grab the first touch that lands on the ring
      if (joystickTouchId !== null) return;
      const touch = e.changedTouches[0];
      joystickTouchId = touch.identifier;

      // Recalculate center in case the ring moved (orientation change etc.)
      const rect = ringEl.getBoundingClientRect();
      originX = rect.left + rect.width / 2;
      originY = rect.top + rect.height / 2;

      e.stopPropagation(); // prevent this touch from also starting a camera drag
    };

    const onTouchMove = (e) => {
      if (joystickTouchId === null) return;

      // Find the touch that belongs to this joystick
      let touch = null;
      for (const t of e.changedTouches) {
        if (t.identifier === joystickTouchId) { touch = t; break; }
      }
      if (!touch) return;

      // Raw offset from ring center
      const dx = touch.clientX - originX;
      const dy = touch.clientY - originY;

      // Clamp to a circle so the knob stays inside the ring
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clampedDist = Math.min(dist, MAX_RADIUS);
      const angle = Math.atan2(dy, dx);

      const kx = Math.cos(angle) * clampedDist;
      const ky = Math.sin(angle) * clampedDist;

      // Move the knob visually
      this._joystickKnob.style.transform = `translate(${kx}px, ${ky}px)`;

      // Convert position to directional booleans.
      // A dead zone of 20% of MAX_RADIUS avoids accidental tiny drifts.
      const DEAD = MAX_RADIUS * 0.2;

      this._keys.forward = ky < -DEAD;  // up   = move forward
      this._keys.back    = ky >  DEAD;  // down = move back
      this._keys.left    = kx < -DEAD;  // left = strafe left
      this._keys.right   = kx >  DEAD;  // right = strafe right

      e.stopPropagation(); // don't let this move trigger the camera drag
    };

    const onTouchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joystickTouchId) {
          joystickTouchId = null;
          break;
        }
      }
      if (joystickTouchId !== null) return; // a different touch ended, not ours

      // Snap knob back to center
      this._joystickKnob.style.transform = 'translate(0px, 0px)';

      // Release all movement keys
      this._keys.forward = false;
      this._keys.back    = false;
      this._keys.left    = false;
      this._keys.right   = false;
    };

    // Use the ring element (not document) so these touches stay isolated
    ringEl.addEventListener('touchstart',  onTouchStart,  { passive: true });
    ringEl.addEventListener('touchmove',   onTouchMove,   { passive: true });
    ringEl.addEventListener('touchend',    onTouchEnd,    { passive: true });
    ringEl.addEventListener('touchcancel', onTouchEnd,    { passive: true });
  }

  syncFromCamera() {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
    this.pitch = e.x;
    this.yaw   = e.y;
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
  }

  update() {
    if (!this.enabled) return;

    const e = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(e);

    // WASD movement in explore mode — camera leads direction
    if (this.exploreMode) {
      _direction.set(0, 0, 0);

      // Forward follows full camera direction (including pitch)
      _forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();

      // Right is always horizontal
      _right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      _right.y = 0;
      _right.normalize();

      if (this._keys.forward) _direction.add(_forward);
      if (this._keys.back)    _direction.sub(_forward);
      if (this._keys.right)   _direction.add(_right);
      if (this._keys.left)    _direction.sub(_right);
      if (this._keys.up)      _direction.y += 1;
      if (this._keys.down)    _direction.y -= 1;

      if (_direction.lengthSq() > 0) {
        _direction.normalize().multiplyScalar(this.moveSpeed);
        this.camera.position.add(_direction);
      }
    }
  }

  resetKeys() {
    this._keys.forward = false;
    this._keys.back = false;
    this._keys.left = false;
    this._keys.right = false;
    this._keys.up = false;
    this._keys.down = false;
  }
}

export { PageLookControls };
