(() => {
  'use strict';

  const viewer3D = window.appViewers.viewer3D;
  const viewer2D = window.appViewers.viewer2D;

  const clockEl = document.getElementById('utcClock');
  function updateUtcClock() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = `UTC ${now.toUTCString().slice(17, 25)}`;
    }
  }
  setInterval(updateUtcClock, 1000);
  updateUtcClock();

  const btnPlayPause = document.getElementById('btnPlayPause');
  const playIcon = document.getElementById('playIcon');
  const timeScrubber = document.getElementById('timeScrubber');
  const simTimeDisplay = document.getElementById('simTimeDisplay');
  const btnLiveNow = document.getElementById('btnLiveNow');

  let isScrubbing = false;

  if (btnPlayPause) {
    btnPlayPause.addEventListener('click', () => {
      viewer3D.clock.shouldAnimate = !viewer3D.clock.shouldAnimate;
      if (playIcon) playIcon.textContent = viewer3D.clock.shouldAnimate ? '⏸' : '▶';
    });
  }

  if (btnLiveNow) {
    btnLiveNow.addEventListener('click', () => {
      viewer3D.clock.currentTime = Cesium.JulianDate.now();
      viewer3D.clock.multiplier = 1;
      viewer3D.clock.shouldAnimate = true;
      if (playIcon) playIcon.textContent = '⏸';

      document.querySelectorAll('.speed-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.speed === '1');
      });
    });
  }

  if (timeScrubber) {
    timeScrubber.addEventListener('mousedown', () => { isScrubbing = true; });
    timeScrubber.addEventListener('touchstart', () => { isScrubbing = true; });

    timeScrubber.addEventListener('input', () => {
      const fraction = timeScrubber.value / 1000;
      const targetSeconds = fraction * window.appOrbit.totalDurationSec;
      const targetTime = Cesium.JulianDate.addSeconds(
        window.appOrbit.startTime,
        targetSeconds,
        new Cesium.JulianDate()
      );
      viewer3D.clock.currentTime = targetTime;
    });

    window.addEventListener('mouseup', () => { isScrubbing = false; });
    window.addEventListener('touchend', () => { isScrubbing = false; });
  }

  const speedButtons = document.querySelectorAll('.speed-btn');
  speedButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const speed = parseFloat(btn.dataset.speed);
      viewer3D.clock.multiplier = speed;
      speedButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const issAltitudeEl = document.getElementById('issAltitude');
  const issVelocityEl = document.getElementById('issVelocity');
  const issCoordsEl = document.getElementById('issCoords');
  const issOrbitNumEl = document.getElementById('issOrbitNum');

  viewer3D.clock.onTick.addEventListener(() => {
    const satrec = window.appOrbit.activeSatrec;
    if (!satrec) return;

    const currentJulian = viewer3D.clock.currentTime;
    const elapsedSec = Cesium.JulianDate.secondsDifference(currentJulian, window.appOrbit.startTime);

    if (!isScrubbing && timeScrubber) {
      const progress = Math.min(Math.max(elapsedSec / window.appOrbit.totalDurationSec, 0), 1);
      timeScrubber.value = Math.round(progress * 1000);
    }

    if (simTimeDisplay) {
      const prefix = elapsedSec >= 0 ? '+' : '-';
      const absSec = Math.abs(elapsedSec);
      const hours = Math.floor(absSec / 3600);
      const mins = Math.floor((absSec % 3600) / 60);
      const secs = Math.floor(absSec % 60);
      simTimeDisplay.textContent = `${prefix}${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    if (issOrbitNumEl) {
      const currentOrbit = Math.max(1, Math.floor(elapsedSec / window.appOrbit.ORBIT_PERIOD_SEC) + 1);
      issOrbitNumEl.textContent = `Orbit #${currentOrbit}`;
    }

    const jsDate = Cesium.JulianDate.toDate(currentJulian);
    const pv = satellite.propagate(satrec, jsDate);

    if (pv && pv.position && pv.velocity) {
      const gmst = satellite.gstime(jsDate);
      const geodetic = satellite.eciToGeodetic(pv.position, gmst);
      const latDeg = Cesium.Math.toDegrees(geodetic.latitude).toFixed(2);
      const lonDeg = Cesium.Math.toDegrees(geodetic.longitude).toFixed(2);
      const altKm = geodetic.height.toFixed(1);

      const vx = pv.velocity.x;
      const vy = pv.velocity.y;
      const vz = pv.velocity.z;
      const speedKmSec = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const speedKmH = Math.round(speedKmSec * 3600).toLocaleString('en-US');

      if (issAltitudeEl) issAltitudeEl.textContent = `${altKm} km`;
      if (issVelocityEl) issVelocityEl.textContent = `${speedKmH} km/h`;
      if (issCoordsEl) issCoordsEl.textContent = `${latDeg}°, ${lonDeg}°`;
    }
  });

  let isTracking = false;
  const btnTrackISS = document.getElementById('btnTrackISS');
  const trackLabel = document.getElementById('trackLabel');

  if (btnTrackISS) {
    btnTrackISS.addEventListener('click', () => {
      isTracking = !isTracking;
      if (isTracking) {
        viewer3D.trackedEntity = window.appOrbit.iss3D;
        if (trackLabel) trackLabel.textContent = 'Unbind Camera';
        btnTrackISS.classList.add('tracking');
        setActiveDockBtn('');
      } else {
        viewer3D.trackedEntity = undefined;
        if (trackLabel) trackLabel.textContent = 'Lock Camera to ISS';
        btnTrackISS.classList.remove('tracking');
      }
    });
  }

  function unbindCameraTracking() {
    if (isTracking) {
      isTracking = false;
      viewer3D.trackedEntity = undefined;
      if (trackLabel) trackLabel.textContent = 'Lock Camera to ISS';
      if (btnTrackISS) btnTrackISS.classList.remove('tracking');
    }
  }

  function setTrackedState(state) {
    isTracking = !!state;
    if (isTracking) {
      if (trackLabel) trackLabel.textContent = 'Unbind Camera';
      if (btnTrackISS) btnTrackISS.classList.add('tracking');
      setActiveDockBtn('');
    } else {
      if (trackLabel) trackLabel.textContent = 'Lock Camera to ISS';
      if (btnTrackISS) btnTrackISS.classList.remove('tracking');
    }
  }

  let isLightingOn = false;
  const btnLighting = document.getElementById('btnToggleLighting');
  const lightingLabel = document.getElementById('lightingLabel');
  if (btnLighting) {
    btnLighting.addEventListener('click', () => {
      isLightingOn = !isLightingOn;
      viewer3D.scene.globe.enableLighting = isLightingOn;
      viewer2D.scene.globe.enableLighting = isLightingOn;
      if (lightingLabel) lightingLabel.textContent = isLightingOn ? 'Sun: ON' : 'Sun: OFF';
      btnLighting.classList.toggle('active', isLightingOn);
    });
  }

  const explainerModal = document.getElementById('explainerModal');
  const btnToggleExplainer = document.getElementById('btnToggleExplainer');
  const btnCloseExplainer = document.getElementById('btnCloseExplainer');

  if (btnToggleExplainer && explainerModal) {
    btnToggleExplainer.addEventListener('click', () => {
      explainerModal.classList.toggle('open');
    });
  }
  if (btnCloseExplainer && explainerModal) {
    btnCloseExplainer.addEventListener('click', () => {
      explainerModal.classList.remove('open');
    });
  }

  const btnReset2D = document.getElementById('btnReset2D');
  if (btnReset2D) {
    btnReset2D.addEventListener('click', () => window.appViewers.fit2DWorld());
  }

  const modeButtons = document.querySelectorAll('.mode-btn');
  let currentViewMode = 'split';

  function setViewMode(mode) {
    currentViewMode = mode;
    document.body.classList.remove('view-split', 'view-globe', 'view-map');
    document.body.classList.add(`view-${mode}`);

    const p2D = document.getElementById('cesium2D');
    const p3D = document.getElementById('cesium3D');
    if (p2D) p2D.style.flex = '';
    if (p3D) p3D.style.flex = '';

    modeButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const interval = setInterval(() => {
      viewer3D.resize();
      viewer2D.resize();
    }, 30);
    setTimeout(() => {
      clearInterval(interval);
      viewer3D.resize();
      viewer2D.resize();
      if (mode === 'map' || mode === 'split') {
        window.appViewers.fit2DWorld();
      }
    }, 500);
  }

  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setViewMode(btn.dataset.mode);
    });
  });

  const btnCloseMap = document.getElementById('btnCloseMap');
  if (btnCloseMap) {
    btnCloseMap.addEventListener('click', () => {
      setViewMode('globe');
    });
  }

  const dockButtons = document.querySelectorAll('.dock-btn');
  function setActiveDockBtn(id) {
    dockButtons.forEach(btn => btn.classList.toggle('active', btn.id === id));
  }

  const camGlobal = document.getElementById('camGlobal');
  if (camGlobal) {
    camGlobal.addEventListener('click', () => {
      unbindCameraTracking();
      window.appViewers.setSimulationCamera(1.5);
      setActiveDockBtn('camGlobal');
    });
  }

  const camEurope = document.getElementById('camEurope');
  if (camEurope) {
    camEurope.addEventListener('click', () => {
      unbindCameraTracking();
      viewer3D.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(15.0, 50.0, 7000000),
        duration: 1.5
      });
      setActiveDockBtn('camEurope');
    });
  }

  const camAmericas = document.getElementById('camAmericas');
  if (camAmericas) {
    camAmericas.addEventListener('click', () => {
      unbindCameraTracking();
      viewer3D.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(-95.0, 40.0, 9000000),
        duration: 1.5
      });
      setActiveDockBtn('camAmericas');
    });
  }

  const camAsia = document.getElementById('camAsia');
  if (camAsia) {
    camAsia.addEventListener('click', () => {
      unbindCameraTracking();
      viewer3D.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(100.0, 35.0, 8500000),
        duration: 1.5
      });
      setActiveDockBtn('camAsia');
    });
  }

  const divider = document.querySelector('.panel-divider');
  const container = document.getElementById('container');
  const panel2D = document.getElementById('cesium2D');
  const panel3D = document.getElementById('cesium3D');
  let isDividerDragging = false;

  if (divider && container && panel2D && panel3D) {
    divider.addEventListener('mousedown', (e) => {
      isDividerDragging = true;
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDividerDragging) return;
      const containerRect = container.getBoundingClientRect();
      const offset = e.clientX - containerRect.left;
      const percent = (offset / containerRect.width) * 100;

      if (percent >= 15 && percent <= 60) {
        panel2D.style.flex = `0 0 ${percent}%`;
        panel3D.style.flex = '1';
        viewer2D.resize();
        viewer3D.resize();
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDividerDragging) {
        isDividerDragging = false;
        document.body.style.cursor = '';
        viewer2D.resize();
        viewer3D.resize();
      }
    });
  }

  window.appUI = {
    unbindCameraTracking,
    setTrackedState,
    setActiveDockBtn,
    setViewMode
  };
})();
