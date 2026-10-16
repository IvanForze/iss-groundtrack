import { viewer3D, viewer2D } from './viewers.js';

function addSeconds(julianDate, seconds) {
  return Cesium.JulianDate.addSeconds(julianDate, seconds, new Cesium.JulianDate());
}

export const WTIA_POS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
export const WTIA_TLE_URL = 'https://api.wheretheiss.at/v1/satellites/25544/tles';

export const defaultTleLine1 = '1 25544U 98067A   26284.82161096  .00007651  00000+0  14771-3 0  9996';
export const defaultTleLine2 = '2 25544  51.6314  82.9019 0006707 250.7442 109.2821 15.48831270589830';

export const ORBIT_PERIOD_SEC = 5556;
export const TOTAL_ORBITS = 6;
export const totalDurationSec = TOTAL_ORBITS * ORBIT_PERIOD_SEC;

export let activeSatrec = satellite.twoline2satrec(defaultTleLine1, defaultTleLine2);
export let startTime = Cesium.JulianDate.now();
export let stopTime = addSeconds(startTime, totalDurationSec);

const clock = viewer3D.clock;
clock.startTime = startTime.clone();
clock.stopTime = stopTime.clone();
clock.currentTime = startTime.clone();
clock.clockRange = Cesium.ClockRange.LOOP_STOP;
clock.multiplier = 1;
clock.shouldAnimate = true;

export const iss3D = viewer3D.entities.add({
  name: 'International Space Station',
  viewFrom: new Cesium.Cartesian3(-1200.0, -2400.0, 850.0),
  model: {
    uri: 'models/ISS_stationary.glb',
    minimumPixelSize: 64,
    maximumScale: 5000,
    scale: 25
  },
  path: {
    resolution: 5,
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.25,
      color: Cesium.Color.fromCssColorString('#38bdf8')
    }),
    width: 4,
    leadTime: ORBIT_PERIOD_SEC * 1.5,
    trailTime: ORBIT_PERIOD_SEC * 2.5
  }
});

export const iss2D = viewer2D.entities.add({
  name: 'ISS Ground Track Marker',
  point: {
    pixelSize: 14,
    color: Cesium.Color.fromCssColorString('#38bdf8'),
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 2
  },
  path: {
    resolution: 5,
    material: new Cesium.PolylineGlowMaterialProperty({
      glowPower: 0.35,
      color: Cesium.Color.fromCssColorString('#f59e0b')
    }),
    width: 3.5,
    leadTime: ORBIT_PERIOD_SEC * 1.5,
    trailTime: ORBIT_PERIOD_SEC * 3.5
  }
});

let cachedEciSamples = [];
let referenceGmst = 0;
let currentRotationFactor = 1.0;
let targetRotationFactor = 1.0;
let isEarthRotationActiveState = true;
let rotationTween = null;

function precomputeEciSamples(satrecInstance, baseStartTime) {
  cachedEciSamples = [];
  const sampleStepSec = 20;
  const pastSeconds = ORBIT_PERIOD_SEC * 3;
  const futureSeconds = totalDurationSec + ORBIT_PERIOD_SEC * 3;

  const baseDate = Cesium.JulianDate.toDate(baseStartTime);
  referenceGmst = satellite.gstime(baseDate);

  for (let offset = -pastSeconds; offset <= futureSeconds; offset += sampleStepSec) {
    const time = addSeconds(baseStartTime, offset);
    const jsDate = Cesium.JulianDate.toDate(time);

    const pv = satellite.propagate(satrecInstance, jsDate);
    if (pv && pv.position) {
      const realGmst = satellite.gstime(jsDate);
      cachedEciSamples.push({
        time,
        eciPos: pv.position,
        deltaGmst: realGmst - referenceGmst
      });
    }
  }
}

function createPositionProperty(factor) {
  const newPositionProperty = new Cesium.SampledPositionProperty();
  newPositionProperty.setInterpolationOptions({
    interpolationDegree: 2,
    interpolationAlgorithm: Cesium.HermitePolynomialApproximation
  });

  for (let i = 0; i < cachedEciSamples.length; i++) {
    const s = cachedEciSamples[i];
    const gmst = referenceGmst + factor * s.deltaGmst;
    const geodetic = satellite.eciToGeodetic(s.eciPos, gmst);
    const cartesian = Cesium.Cartesian3.fromRadians(
      geodetic.longitude,
      geodetic.latitude,
      geodetic.height * 1000
    );
    newPositionProperty.addSample(s.time, cartesian);
  }
  return newPositionProperty;
}

let isInertial3DMode = false;

function createInertialPositionProperty() {
  const prop = new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.INERTIAL);
  prop.setInterpolationOptions({
    interpolationDegree: 2,
    interpolationAlgorithm: Cesium.HermitePolynomialApproximation
  });

  for (let i = 0; i < cachedEciSamples.length; i++) {
    const s = cachedEciSamples[i];
    const cartesian = new Cesium.Cartesian3(
      s.eciPos.x * 1000,
      s.eciPos.y * 1000,
      s.eciPos.z * 1000
    );
    prop.addSample(s.time, cartesian);
  }
  return prop;
}

export function set3DReferenceFrame(mode) {
  isInertial3DMode = (mode === 'inertial');
  if (isInertial3DMode) {
    iss3D.position = createInertialPositionProperty();
    iss3D.orientation = new Cesium.VelocityOrientationProperty(iss3D.position);
  } else {
    applyRotationFactor(currentRotationFactor);
  }
}

function applyRotationFactor(factor) {
  currentRotationFactor = factor;
  if (cachedEciSamples.length === 0) return;

  const newProperty = createPositionProperty(factor);

  if (!isInertial3DMode) {
    iss3D.position = newProperty;
    iss3D.orientation = new Cesium.VelocityOrientationProperty(iss3D.position);
  }
  iss2D.position = newProperty;
}

function updateShiftDisplay(factor) {
  const shiftDisplay = document.getElementById('shiftValueDisplay');
  const shiftTag = document.getElementById('shiftStatusTag');
  const kmPerDeg = 111.32;
  const standardShiftDeg = 22.9;

  const effectiveShift = (standardShiftDeg * factor).toFixed(1);
  const effectiveKm = Math.round(standardShiftDeg * factor * kmPerDeg).toLocaleString('en-US');

  if (shiftDisplay) {
    if (factor > 0.05) {
      shiftDisplay.innerHTML = `Δλ ≈ -${effectiveShift}° <span class="shift-sub">/ pass (~${effectiveKm} km)</span>`;
    } else {
      shiftDisplay.innerHTML = `<span style="color:var(--cyan)">Δλ = 0.0°</span> <span class="shift-sub">/ REPEATING SINGLE TRACK</span>`;
    }
  }

  if (shiftTag) {
    if (factor > 0.05) {
      shiftTag.textContent = 'SPIN ON';
      shiftTag.classList.remove('frozen');
    } else {
      shiftTag.textContent = 'SPIN FROZEN';
      shiftTag.classList.add('frozen');
    }
  }
}

export function toggleEarthRotation() {
  isEarthRotationActiveState = !isEarthRotationActiveState;
  targetRotationFactor = isEarthRotationActiveState ? 1.0 : 0.0;

  if (rotationTween) {
    rotationTween.kill();
  }

  const duration = 1.8;
  const factorObj = { factor: currentRotationFactor };

  if (window.gsap) {
    rotationTween = gsap.to(factorObj, {
      factor: targetRotationFactor,
      duration,
      ease: 'power2.inOut',
      onUpdate: () => {
        applyRotationFactor(factorObj.factor);
        updateShiftDisplay(factorObj.factor);
      },
      onComplete: () => {
        rotationTween = null;
      }
    });
  } else {
    applyRotationFactor(targetRotationFactor);
    updateShiftDisplay(targetRotationFactor);
  }

  const btn = document.getElementById('btnToggleEarthRotation');
  const lbl = document.getElementById('rotationLabel');
  if (btn) {
    btn.classList.toggle('active', isEarthRotationActiveState);
    btn.classList.toggle('frozen', !isEarthRotationActiveState);
  }
  if (lbl) {
    lbl.textContent = isEarthRotationActiveState ? 'Earth Spin: ON' : 'Earth Spin: OFF';
  }

  return isEarthRotationActiveState;
}

export function isEarthRotationActive() {
  return isEarthRotationActiveState;
}

export function getRotationFactor() {
  return currentRotationFactor;
}

function updateOrbitData(satrecInstance, baseStartTime) {
  precomputeEciSamples(satrecInstance, baseStartTime);
  applyRotationFactor(currentRotationFactor);
  updateShiftDisplay(currentRotationFactor);
}

updateOrbitData(activeSatrec, startTime);

async function fetchRealISSData() {
  const apiStatusText = document.getElementById('apiStatusText');
  const issVisibilityEl = document.getElementById('issVisibility');

  try {
    if (apiStatusText) apiStatusText.textContent = 'WTIA: SYNCING...';

    const [posRes, tleRes] = await Promise.all([
      fetch(WTIA_POS_URL),
      fetch(WTIA_TLE_URL)
    ]);

    if (!posRes.ok || !tleRes.ok) throw new Error('API fetch failed');

    const posData = await posRes.json();
    const tleData = await tleRes.json();

    activeSatrec = satellite.twoline2satrec(tleData.line1, tleData.line2);

    startTime = Cesium.JulianDate.fromDate(new Date(posData.timestamp * 1000));
    stopTime = addSeconds(startTime, totalDurationSec);

    clock.startTime = startTime.clone();
    clock.stopTime = stopTime.clone();
    clock.currentTime = startTime.clone();
    clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    clock.multiplier = 1;
    clock.shouldAnimate = true;

    updateOrbitData(activeSatrec, startTime);

    if (apiStatusText) apiStatusText.textContent = `WTIA LIVE (NORAD ${posData.id})`;
    if (issVisibilityEl && posData.visibility) {
      issVisibilityEl.textContent = posData.visibility.toUpperCase();
    }
  } catch (err) {
    console.warn('WTIA fetch fallback to local TLE:', err);
    if (apiStatusText) apiStatusText.textContent = 'OFFLINE TLE MODE';

    activeSatrec = satellite.twoline2satrec(defaultTleLine1, defaultTleLine2);
    startTime = Cesium.JulianDate.now();
    stopTime = addSeconds(startTime, totalDurationSec);

    clock.startTime = startTime.clone();
    clock.stopTime = stopTime.clone();
    clock.currentTime = startTime.clone();
    clock.multiplier = 1;
    clock.shouldAnimate = true;

    updateOrbitData(activeSatrec, startTime);
  }
}

fetchRealISSData();

setInterval(async () => {
  try {
    const res = await fetch(WTIA_POS_URL);
    if (res.ok) {
      const live = await res.json();
      const issVisibilityEl = document.getElementById('issVisibility');
      if (issVisibilityEl && live.visibility) {
        issVisibilityEl.textContent = live.visibility.toUpperCase();
      }
    }
  } catch (e) { }
}, 12000);

export const appOrbit = {
  get activeSatrec() { return activeSatrec; },
  get startTime() { return startTime; },
  get totalDurationSec() { return totalDurationSec; },
  ORBIT_PERIOD_SEC,
  iss3D,
  iss2D,
  toggleEarthRotation,
  isEarthRotationActive,
  getRotationFactor,
  set3DReferenceFrame
};

window.appOrbit = appOrbit;
