(() => {
  'use strict';

  function addSeconds(julianDate, seconds) {
    return Cesium.JulianDate.addSeconds(julianDate, seconds, new Cesium.JulianDate());
  }

  const WTIA_POS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
  const WTIA_TLE_URL = 'https://api.wheretheiss.at/v1/satellites/25544/tles';

  const defaultTleLine1 = '1 25544U 98067A   26284.82161096  .00007651  00000+0  14771-3 0  9996';
  const defaultTleLine2 = '2 25544  51.6314  82.9019 0006707 250.7442 109.2821 15.48831270589830';

  const ORBIT_PERIOD_SEC = 5556;
  const TOTAL_ORBITS = 6;
  const totalDurationSec = TOTAL_ORBITS * ORBIT_PERIOD_SEC;

  let activeSatrec = satellite.twoline2satrec(defaultTleLine1, defaultTleLine2);
  let startTime = Cesium.JulianDate.now();
  let stopTime = addSeconds(startTime, totalDurationSec);

  const clock = window.appViewers.viewer3D.clock;
  clock.startTime = startTime.clone();
  clock.stopTime = stopTime.clone();
  clock.currentTime = startTime.clone();
  clock.clockRange = Cesium.ClockRange.LOOP_STOP;
  clock.multiplier = 1;
  clock.shouldAnimate = true;

  // 3D ISS entity in viewer3D
  const iss3D = window.appViewers.viewer3D.entities.add({
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

  // 2D Ground Track Marker in viewer2D
  const iss2D = window.appViewers.viewer2D.entities.add({
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
  let isEarthRotationActive = true;
  let rotationTween = null;

  // Precompute inertial ECI samples once
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

  // Create position property interpolated for specific rotation factor
  function createPositionProperty(factor) {
    const newPositionProperty = new Cesium.SampledPositionProperty();
    newPositionProperty.setInterpolationOptions({
      interpolationDegree: 2,
      interpolationAlgorithm: Cesium.HermitePolynomialApproximation
    });

    for (let i = 0; i < cachedEciSamples.length; i++) {
      const s = cachedEciSamples[i];
      // When factor = 1: standard Earth rotation
      // When factor = 0: Earth stands still at reference orientation
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

  // Create position property in true INERTIAL space (ECI / ICRF)
  function createInertialPositionProperty() {
    const prop = new Cesium.SampledPositionProperty(Cesium.ReferenceFrame.INERTIAL);
    prop.setInterpolationOptions({
      interpolationDegree: 2,
      interpolationAlgorithm: Cesium.HermitePolynomialApproximation
    });

    for (let i = 0; i < cachedEciSamples.length; i++) {
      const s = cachedEciSamples[i];
      // s.eciPos is already inertial (in km). Convert to meters:
      const cartesian = new Cesium.Cartesian3(
        s.eciPos.x * 1000,
        s.eciPos.y * 1000,
        s.eciPos.z * 1000
      );
      prop.addSample(s.time, cartesian);
    }
    return prop;
  }

  function set3DReferenceFrame(mode) {
    isInertial3DMode = (mode === 'inertial');
    if (isInertial3DMode) {
      const inertialProp = createInertialPositionProperty();
      iss3D.position = inertialProp;
      iss3D.orientation = new Cesium.VelocityOrientationProperty(inertialProp);
    } else {
      const fixedProp = createPositionProperty(currentRotationFactor);
      iss3D.position = fixedProp;
      iss3D.orientation = new Cesium.VelocityOrientationProperty(fixedProp);
    }
  }

  function applyRotationFactor(factor) {
    const prop = createPositionProperty(factor);
    if (!isInertial3DMode) {
      iss3D.position = prop;
      iss3D.orientation = new Cesium.VelocityOrientationProperty(prop);
    }
    iss2D.position = prop;
  }

  function updateShiftDisplay(factor) {
    const shiftValEl = document.getElementById('shiftValueDisplay');
    const shiftTagEl = document.getElementById('shiftStatusTag');
    if (shiftValEl) {
      if (factor <= 0.01) {
        shiftValEl.innerHTML = `Δλ = 0.0° <span class="shift-sub">/ pass (Single Repeating Track!)</span>`;
      } else {
        const deg = (22.9 * factor).toFixed(1);
        const km = Math.round(2550 * factor);
        shiftValEl.innerHTML = `Δλ ≈ -${deg}° <span class="shift-sub">/ pass (~${km.toLocaleString()} km)</span>`;
      }
    }
    if (shiftTagEl) {
      if (factor <= 0.01) {
        shiftTagEl.textContent = 'SPIN FROZEN';
        shiftTagEl.classList.add('frozen');
      } else {
        shiftTagEl.textContent = 'SPIN ON';
        shiftTagEl.classList.remove('frozen');
      }
    }
  }

  function toggleEarthRotation(enable) {
    if (typeof enable === 'boolean') {
      isEarthRotationActive = enable;
    } else {
      isEarthRotationActive = !isEarthRotationActive;
    }

    targetRotationFactor = isEarthRotationActive ? 1.0 : 0.0;

    if (rotationTween) {
      rotationTween.kill();
      rotationTween = null;
    }

    const animObj = { factor: currentRotationFactor };
    if (window.gsap) {
      rotationTween = gsap.to(animObj, {
        factor: targetRotationFactor,
        duration: 1.8,
        ease: 'power2.inOut',
        onUpdate: () => {
          currentRotationFactor = animObj.factor;
          applyRotationFactor(currentRotationFactor);
          updateShiftDisplay(currentRotationFactor);
        },
        onComplete: () => {
          currentRotationFactor = targetRotationFactor;
          applyRotationFactor(currentRotationFactor);
          updateShiftDisplay(currentRotationFactor);
          rotationTween = null;
        }
      });
    } else {
      currentRotationFactor = targetRotationFactor;
      applyRotationFactor(currentRotationFactor);
      updateShiftDisplay(currentRotationFactor);
    }

    const btn = document.getElementById('btnToggleEarthRotation');
    const lbl = document.getElementById('rotationLabel');
    if (btn) {
      btn.classList.toggle('active', isEarthRotationActive);
      btn.classList.toggle('frozen', !isEarthRotationActive);
    }
    if (lbl) {
      lbl.textContent = isEarthRotationActive ? 'Earth Spin: ON' : 'Earth Spin: OFF';
    }

    return isEarthRotationActive;
  }

  // Generate orbit trajectory
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

      const clock = window.appViewers.viewer3D.clock;
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

      const clock = window.appViewers.viewer3D.clock;
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
    } catch (e) {
      // ignore
    }
  }, 12000);

  window.appOrbit = {
    get activeSatrec() { return activeSatrec; },
    get startTime() { return startTime; },
    get totalDurationSec() { return totalDurationSec; },
    ORBIT_PERIOD_SEC,
    iss3D,
    iss2D,
    toggleEarthRotation,
    isEarthRotationActive: () => isEarthRotationActive,
    getRotationFactor: () => currentRotationFactor,
    set3DReferenceFrame
  };
})();
