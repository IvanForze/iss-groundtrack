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

  const positionProperty = new Cesium.SampledPositionProperty();
  positionProperty.setInterpolationOptions({
    interpolationDegree: 5,
    interpolationAlgorithm: Cesium.LagrangePolynomialApproximation
  });
  const orientationProperty = new Cesium.VelocityOrientationProperty(positionProperty);

  const iss3D = window.appViewers.viewer3D.entities.add({
    name: 'International Space Station',
    position: positionProperty,
    orientation: orientationProperty,
    viewFrom: new Cesium.Cartesian3(-1200.0, -2400.0, 850.0),
    model: {
      uri: 'models/ISS_stationary.glb',
      minimumPixelSize: 64,
      maximumScale: 5000,
      scale: 25
    },
    path: {
      resolution: 1,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.25,
        color: Cesium.Color.CYAN
      }),
      width: 4,
      leadTime: ORBIT_PERIOD_SEC,
      trailTime: ORBIT_PERIOD_SEC * 4
    }
  });

  const iss2D = window.appViewers.viewer2D.entities.add({
    name: 'ISS Ground Track Marker',
    position: positionProperty,
    point: {
      pixelSize: 14,
      color: Cesium.Color.fromCssColorString('#38bdf8'),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2
    },
    path: {
      resolution: 1,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.35,
        color: Cesium.Color.fromCssColorString('#f59e0b')
      }),
      width: 3.5,
      leadTime: ORBIT_PERIOD_SEC,
      trailTime: ORBIT_PERIOD_SEC * 4
    }
  });

  function generateOrbitSamples(satrecInstance, baseStartTime) {
    const sampleStepSec = 20;
    const pastSeconds = ORBIT_PERIOD_SEC;
    const futureSeconds = totalDurationSec;

    for (let offset = -pastSeconds; offset <= futureSeconds; offset += sampleStepSec) {
      const time = addSeconds(baseStartTime, offset);
      const jsDate = Cesium.JulianDate.toDate(time);

      const pv = satellite.propagate(satrecInstance, jsDate);
      if (pv && pv.position) {
        const gmst = satellite.gstime(jsDate);
        const geodetic = satellite.eciToGeodetic(pv.position, gmst);
        const cartesian = Cesium.Cartesian3.fromRadians(
          geodetic.longitude,
          geodetic.latitude,
          geodetic.height * 1000
        );
        positionProperty.addSample(time, cartesian);
      }
    }
  }

  generateOrbitSamples(activeSatrec, startTime);

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

      generateOrbitSamples(activeSatrec, startTime);

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

      generateOrbitSamples(activeSatrec, startTime);
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
    iss2D
  };
})();
