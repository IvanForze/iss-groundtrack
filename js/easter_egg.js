import { viewer3D, setSimulationCamera } from './viewers.js';
import { setViewMode, unbindCameraTracking, setActiveDockBtn } from './ui.js';

let isEasterEggActiveState = false;
let preRenderRemover = null;
let previousViewMode = null;
let previousDockBtn = null;
let distanceCounterInterval = null;

function getMoonTextureUrl() {
  const isFinalProject = window.location.pathname.includes('/final-project');
  const origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
  if (isFinalProject) {
    return `${origin}/final-project/assets/textures/moon_8k.jpg`;
  }
  const dummy = document.createElement('a');
  dummy.href = 'assets/textures/moon_8k.jpg';
  return dummy.href;
}

const moonTextureUrl = getMoonTextureUrl();

function getMoonAudioUrl() {
  const isFinalProject = window.location.pathname.includes('/final-project');
  const origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
  const filename = encodeURIComponent('Rosa Walton & Hallie Coggins - I Really Want To Stay At Your House.mp3');
  if (isFinalProject) {
    return `${origin}/final-project/assets/${filename}`;
  }
  const dummy = document.createElement('a');
  dummy.href = `assets/${filename}`;
  return dummy.href;
}

let moonAudio = null;

function getMoonAudioElement() {
  if (!moonAudio) {
    moonAudio = document.getElementById('lunarThemeAudio');
    if (!moonAudio) {
      moonAudio = new Audio(getMoonAudioUrl());
    }
    moonAudio.loop = true;
    moonAudio.volume = 0.75;
  }
  return moonAudio;
}

function playMoonAudio() {
  const audio = getMoonAudioElement();
  if (audio) {
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('[Moon Audio] Playback prevented:', err);
      });
    }
  }
}

function stopMoonAudio() {
  if (moonAudio) {
    moonAudio.pause();
    moonAudio.currentTime = 0;
  }
}

function applyMoonTexture() {
  try {
    if (viewer3D && viewer3D.scene) {
      if (!viewer3D.scene.moon) {
        viewer3D.scene.moon = new Cesium.Moon({
          textureUrl: moonTextureUrl,
          onlySunLighting: false,
          show: true
        });
      } else {
        viewer3D.scene.moon.textureUrl = moonTextureUrl;
        viewer3D.scene.moon.onlySunLighting = false;
        viewer3D.scene.moon.show = true;
      }
    }
  } catch (e) {
    console.warn('[Moon] Error configuring Cesium Moon:', e);
  }
}

const preloadMoonImg = new Image();
preloadMoonImg.crossOrigin = 'anonymous';
preloadMoonImg.onload = () => {
  applyMoonTexture();
};
preloadMoonImg.src = moonTextureUrl;

applyMoonTexture();

function getMoonCartesian(time) {
  const julian = time || (viewer3D ? viewer3D.clock.currentTime : Cesium.JulianDate.now());
  let moonInertial = null;
  try {
    if (Cesium.Simon1994PlanetaryPositions && Cesium.Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame) {
      moonInertial = Cesium.Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(julian);
    }
  } catch (e) {
    console.warn('Error computing moon inertial position:', e);
  }

  if (!moonInertial) {
    return new Cesium.Cartesian3(384400000, 0, 34000000);
  }

  let icrfToFixed = null;
  try {
    if (Cesium.Transforms && Cesium.Transforms.computeIcrfToFixedMatrix) {
      icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(julian);
    }
    if (!Cesium.defined(icrfToFixed) && Cesium.Transforms && Cesium.Transforms.computeTemeToPseudoFixedMatrix) {
      icrfToFixed = Cesium.Transforms.computeTemeToPseudoFixedMatrix(julian);
    }
  } catch (e) {}

  if (Cesium.defined(icrfToFixed)) {
    return Cesium.Matrix3.multiplyByVector(icrfToFixed, moonInertial, new Cesium.Cartesian3());
  }
  return moonInertial;
}

let moonSurfaceAngle = Math.PI / 2;

function getEdgerunnersSurfaceView(time) {
  const moonPos = getMoonCartesian(time);
  const earthPos = Cesium.Cartesian3.ZERO;

  const toEarth = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(earthPos, moonPos, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  const worldUp = Cesium.Cartesian3.UNIT_Z;

  const sideAxis = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(toEarth, worldUp, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  const northAxis = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(sideAxis, toEarth, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  const cosAngle = Math.cos(moonSurfaceAngle);
  const sinAngle = Math.sin(moonSurfaceAngle);
  const radialAxis = new Cesium.Cartesian3(
    northAxis.x * cosAngle + sideAxis.x * sinAngle,
    northAxis.y * cosAngle + sideAxis.y * sinAngle,
    northAxis.z * cosAngle + sideAxis.z * sinAngle
  );
  Cesium.Cartesian3.normalize(radialAxis, radialAxis);

  const dBehind = 1700000;
  const dUp = 2260000;

  const camOffset = new Cesium.Cartesian3(
    -toEarth.x * dBehind + radialAxis.x * dUp,
    -toEarth.y * dBehind + radialAxis.y * dUp,
    -toEarth.z * dBehind + radialAxis.z * dUp
  );

  const camPos = Cesium.Cartesian3.add(moonPos, camOffset, new Cesium.Cartesian3());

  const dirToEarth = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(earthPos, camPos, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  const pitch = 4.3 * Math.PI / 180;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  const lookDir = new Cesium.Cartesian3(
    dirToEarth.x * cosP - radialAxis.x * sinP,
    dirToEarth.y * cosP - radialAxis.y * sinP,
    dirToEarth.z * cosP - radialAxis.z * sinP
  );
  Cesium.Cartesian3.normalize(lookDir, lookDir);

  const camRight = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(radialAxis, lookDir, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const camUp = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(lookDir, camRight, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  return {
    moonPos,
    camPos,
    direction: lookDir,
    up: camUp
  };
}

export function launchMoonEasterEgg() {
  if (isEasterEggActiveState) return;
  isEasterEggActiveState = true;

  playMoonAudio();
  applyMoonTexture();
  document.body.classList.add('easter-egg-active');

  if (document.body.classList.contains('landing-active')) {
    const btnLaunch = document.getElementById('btnLaunch');
    if (btnLaunch) btnLaunch.click();
  }

  const body = document.body;
  if (body.classList.contains('view-split')) previousViewMode = 'split';
  else if (body.classList.contains('view-map')) previousViewMode = 'map';
  else previousViewMode = 'globe';

  const activeDock = document.querySelector('.dock-btn.active');
  previousDockBtn = activeDock ? activeDock.id : 'camGlobal';

  setViewMode('globe');
  unbindCameraTracking();

  const hud = document.getElementById('lunarEasterEggHUD');
  if (hud) {
    hud.classList.remove('hidden');
    hud.classList.add('visible');
  }

  try {
    if (viewer3D.camera.frustum && viewer3D.camera.frustum.fov) {
      viewer3D.camera.frustum.fov = Cesium.Math.toRadians(52);
    }
  } catch (e) {}

  const initialView = getEdgerunnersSurfaceView(viewer3D.clock.currentTime);

  const onFlightArrived = () => {
    if (!isEasterEggActiveState) return;

    const overlay = document.getElementById('edgerunnersOverlay');
    if (overlay) overlay.classList.remove('hidden');

    if (preRenderRemover) {
      preRenderRemover();
      preRenderRemover = null;
    }

    preRenderRemover = viewer3D.scene.preRender.addEventListener(() => {
      if (!isEasterEggActiveState) return;
      try {
        const currentView = getEdgerunnersSurfaceView(viewer3D.clock.currentTime);
        viewer3D.camera.setView({
          destination: currentView.camPos,
          orientation: {
            direction: currentView.direction,
            up: currentView.up
          }
        });
      } catch (e) {
        console.error('Error in lunar camera lock:', e);
      }
    });
  };

  viewer3D.camera.flyTo({
    destination: initialView.camPos,
    orientation: {
      direction: initialView.direction,
      up: initialView.up
    },
    duration: 3.0,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    complete: onFlightArrived,
    cancel: onFlightArrived
  });
}

export function animateDistanceCounter(element, start, end, duration) {
  if (!element) return;
  if (distanceCounterInterval) clearInterval(distanceCounterInterval);

  const startTime = performance.now();
  distanceCounterInterval = setInterval(() => {
    const now = performance.now();
    const progress = Math.min((now - startTime) / duration, 1.0);
    const eased = Math.pow(progress, 2.5);
    const current = Math.round(start + (end - start) * eased);
    element.textContent = current.toLocaleString('en-US') + ' KM';

    if (progress >= 1.0) {
      clearInterval(distanceCounterInterval);
      distanceCounterInterval = null;
    }
  }, 40);
}

export function exitMoonEasterEgg() {
  if (!isEasterEggActiveState) return;
  isEasterEggActiveState = false;

  stopMoonAudio();
  const audioBadge = document.getElementById('lunarAudioBadge');
  if (audioBadge && moonAudio) {
    moonAudio.muted = false;
    audioBadge.classList.remove('muted');
  }

  document.body.classList.remove('easter-egg-active');

  try {
    if (viewer3D.camera.frustum && viewer3D.camera.frustum.fov) {
      viewer3D.camera.frustum.fov = Cesium.Math.toRadians(60);
    }
  } catch (e) {}

  const overlay = document.getElementById('edgerunnersOverlay');
  if (overlay) overlay.classList.add('hidden');

  try {
    viewer3D.camera.cancelFlight();
  } catch (e) {}

  if (preRenderRemover) {
    preRenderRemover();
    preRenderRemover = null;
  }
  if (distanceCounterInterval) {
    clearInterval(distanceCounterInterval);
    distanceCounterInterval = null;
  }

  try {
    viewer3D.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  } catch (e) {}

  const hud = document.getElementById('lunarEasterEggHUD');
  if (hud) {
    hud.classList.remove('visible');
    hud.classList.add('hidden');
  }

  setSimulationCamera(2.4, () => {
    applyMoonTexture();

    if (previousViewMode) {
      setViewMode(previousViewMode);
    }

    if (previousDockBtn) {
      setActiveDockBtn(previousDockBtn);
    }
  });
}

export function toggleEasterEgg() {
  if (isEasterEggActiveState) {
    exitMoonEasterEgg();
  } else {
    launchMoonEasterEgg();
  }
}

export function rotateMoon(delta) {
  moonSurfaceAngle += delta;
}

export function getMoonAngle() {
  return moonSurfaceAngle;
}

export function setMoonAngle(rad) {
  moonSurfaceAngle = rad;
}

export function isEasterEggActive() {
  return isEasterEggActiveState;
}

const activeKeys = new Set();
let lastCPress = 0;
let lastPPress = 0;

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const key = e.key.toLowerCase();
  activeKeys.add(key);

  const now = performance.now();
  if (key === 'c') lastCPress = now;
  if (key === 'p') lastPPress = now;

  const simultaneous = activeKeys.has('c') && activeKeys.has('p');
  const quickSequence = Math.abs(lastCPress - lastPPress) < 900 && lastCPress > 0 && lastPPress > 0;

  if (simultaneous || quickSequence) {
    lastCPress = 0;
    lastPPress = 0;
    toggleEasterEgg();
  }

  if (isEasterEggActiveState) {
    if (e.key === 'ArrowLeft' || key === 'a') {
      moonSurfaceAngle -= 0.08;
      e.preventDefault();
    } else if (e.key === 'ArrowRight' || key === 'd') {
      moonSurfaceAngle += 0.08;
      e.preventDefault();
    }
  }

  if (e.key === 'Escape' && isEasterEggActiveState) {
    exitMoonEasterEgg();
  }
});

window.addEventListener('keyup', (e) => {
  activeKeys.delete(e.key.toLowerCase());
});

export const lunarEasterEgg = {
  launch: launchMoonEasterEgg,
  exit: exitMoonEasterEgg,
  toggle: toggleEasterEgg,
  rotate: rotateMoon,
  getAngle: getMoonAngle,
  setAngle: setMoonAngle,
  isActive: isEasterEggActive
};

window.lunarEasterEgg = lunarEasterEgg;

function initLunarHUD() {
  applyMoonTexture();

  const btnExit = document.getElementById('btnExitMoon');
  if (btnExit) {
    btnExit.addEventListener('click', exitMoonEasterEgg);
  }

  const btnLeft = document.getElementById('btnRotateMoonLeft');
  if (btnLeft) {
    btnLeft.addEventListener('click', () => {
      moonSurfaceAngle -= 0.12;
    });
  }

  const btnRight = document.getElementById('btnRotateMoonRight');
  if (btnRight) {
    btnRight.addEventListener('click', () => {
      moonSurfaceAngle += 0.12;
    });
  }

  const btnAudio = document.getElementById('lunarAudioBadge');
  if (btnAudio) {
    btnAudio.addEventListener('click', () => {
      const audio = getMoonAudioElement();
      if (!audio) return;
      audio.muted = !audio.muted;
      btnAudio.classList.toggle('muted', audio.muted);
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLunarHUD);
} else {
  initLunarHUD();
}
