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

  const ICON_PAUSE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
  const ICON_PLAY_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>';

  function setPlayPauseIcon(isPlaying) {
    if (playIcon) {
      playIcon.innerHTML = isPlaying ? ICON_PAUSE_SVG : ICON_PLAY_SVG;
    }
  }

  let isScrubbing = false;

  if (btnPlayPause) {
    btnPlayPause.addEventListener('click', () => {
      viewer3D.clock.shouldAnimate = !viewer3D.clock.shouldAnimate;
      setPlayPauseIcon(viewer3D.clock.shouldAnimate);
    });
  }

  if (btnLiveNow) {
    btnLiveNow.addEventListener('click', () => {
      viewer3D.clock.currentTime = Cesium.JulianDate.now();
      viewer3D.clock.multiplier = 1;
      viewer3D.clock.shouldAnimate = true;
      setPlayPauseIcon(true);

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
  let isEarthView = false;
  let removeEarthViewListener = null;
  let isHullView = false;
  let removeHullViewListener = null;

  const btnTrackISS = document.getElementById('btnTrackISS');
  const trackLabel = document.getElementById('trackLabel');
  const btnEarthView = document.getElementById('btnEarthView');
  const earthViewLabel = document.getElementById('earthViewLabel');
  const btnHullView = document.getElementById('btnHullView');
  const hullViewLabel = document.getElementById('hullViewLabel');

  function disableEarthView() {
    if (removeEarthViewListener) {
      removeEarthViewListener();
      removeEarthViewListener = null;
    }
    if (window.appOrbit && window.appOrbit.iss3D && window.appOrbit.iss3D.model) {
      window.appOrbit.iss3D.model.show = true;
    }
    isEarthView = false;
    if (earthViewLabel) earthViewLabel.textContent = 'Cupola Earth View';
    if (btnEarthView) btnEarthView.classList.remove('earth-active');
  }

  function disableHullView() {
    if (removeHullViewListener) {
      removeHullViewListener();
      removeHullViewListener = null;
    }
    isHullView = false;
    if (hullViewLabel) hullViewLabel.textContent = 'ISS Hull View (EVA)';
    if (btnHullView) btnHullView.classList.remove('hull-active');
  }

  function activateEarthView() {
    if (isTracking) {
      isTracking = false;
      viewer3D.trackedEntity = undefined;
      if (trackLabel) trackLabel.textContent = 'Lock Camera to ISS';
      if (btnTrackISS) btnTrackISS.classList.remove('tracking');
    }
    disableEarthView();
    disableHullView();

    isEarthView = true;
    if (earthViewLabel) earthViewLabel.textContent = 'Exit Earth View';
    if (btnEarthView) btnEarthView.classList.add('earth-active');
    setActiveDockBtn('');

    viewer3D.camera.cancelFlight();
    viewer3D.trackedEntity = undefined;

    // Hide exterior 3D mesh so opaque walls/windows do not block the view of Earth
    if (window.appOrbit && window.appOrbit.iss3D && window.appOrbit.iss3D.model) {
      window.appOrbit.iss3D.model.show = false;
    }

    const startCamPos = viewer3D.camera.positionWC.clone();
    const startCamDir = viewer3D.camera.directionWC.clone();
    const startCamUp = viewer3D.camera.upWC.clone();
    const transitionMs = 1400;
    const startTimeMs = performance.now();

    removeEarthViewListener = viewer3D.scene.preRender.addEventListener(() => {
      if (!window.appOrbit || !window.appOrbit.iss3D || !window.appOrbit.iss3D.position) return;
      const currentTime = viewer3D.clock.currentTime;
      const issPos = window.appOrbit.iss3D.position.getValue(currentTime);
      if (!issPos) return;

      // Geocentric nadir vector towards Earth center
      const toEarth = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.negate(issPos, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      // Instantaneous flight velocity direction (heading vector along orbit)
      const nextTime = Cesium.JulianDate.addSeconds(currentTime, 1.0, new Cesium.JulianDate());
      const nextPos = window.appOrbit.iss3D.position.getValue(nextTime);
      let velDir;
      if (nextPos) {
        velDir = Cesium.Cartesian3.normalize(
          Cesium.Cartesian3.subtract(nextPos, issPos, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
      } else {
        velDir = Cesium.Cartesian3.UNIT_Z;
      }

      // Cupola Earth Observation: look forward-down at Earth (reveals planet surface & curved atmospheric limb)
      const targetLookDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(toEarth, 1.35, new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(velDir, 0.95, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        new Cesium.Cartesian3()
      );

      // Position camera at ISS location in orbit
      const targetCamPos = issPos;

      // Up vector orthogonal to lookDir, tilted towards velocity/sky
      const targetRight = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(targetLookDir, toEarth, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const targetUp = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(targetRight, targetLookDir, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      const elapsed = performance.now() - startTimeMs;
      const linearP = Math.min(1.0, elapsed / transitionMs);
      const easeP = linearP < 0.5 
        ? 4 * linearP * linearP * linearP 
        : 1 - Math.pow(-2 * linearP + 2, 3) / 2;

      let curPos, curDir, curUp;
      if (easeP < 1.0) {
        curPos = Cesium.Cartesian3.lerp(startCamPos, targetCamPos, easeP, new Cesium.Cartesian3());
        curDir = Cesium.Cartesian3.lerp(startCamDir, targetLookDir, easeP, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(curDir, curDir);
        curUp = Cesium.Cartesian3.lerp(startCamUp, targetUp, easeP, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(curUp, curUp);
      } else {
        curPos = targetCamPos;
        curDir = targetLookDir;
        curUp = targetUp;
      }

      const curRight = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(curDir, curUp, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      Cesium.Cartesian3.cross(curRight, curDir, curUp);
      Cesium.Cartesian3.normalize(curUp, curUp);

      viewer3D.camera.position = curPos;
      viewer3D.camera.direction = curDir;
      viewer3D.camera.up = curUp;
      viewer3D.camera.right = curRight;
    });
  }

  function activateHullView() {
    if (isTracking) {
      isTracking = false;
      viewer3D.trackedEntity = undefined;
      if (trackLabel) trackLabel.textContent = 'Lock Camera to ISS';
      if (btnTrackISS) btnTrackISS.classList.remove('tracking');
    }
    disableEarthView();
    disableHullView();

    isHullView = true;
    if (hullViewLabel) hullViewLabel.textContent = 'Exit Hull View';
    if (btnHullView) btnHullView.classList.add('hull-active');
    setActiveDockBtn('');

    viewer3D.camera.cancelFlight();
    viewer3D.trackedEntity = undefined;

    // Ensure 3D model is visible so we see the station structure in front of and below us
    if (window.appOrbit && window.appOrbit.iss3D && window.appOrbit.iss3D.model) {
      window.appOrbit.iss3D.model.show = true;
    }

    const startCamPos = viewer3D.camera.positionWC.clone();
    const startCamDir = viewer3D.camera.directionWC.clone();
    const startCamUp = viewer3D.camera.upWC.clone();
    const transitionMs = 1400;
    const startTimeMs = performance.now();

    removeHullViewListener = viewer3D.scene.preRender.addEventListener(() => {
      if (!window.appOrbit || !window.appOrbit.iss3D || !window.appOrbit.iss3D.position) return;
      const currentTime = viewer3D.clock.currentTime;
      const issPos = window.appOrbit.iss3D.position.getValue(currentTime);
      if (!issPos) return;

      // Geocentric nadir (down to Earth) and Zenith (space)
      const toEarth = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.negate(issPos, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const zenith = Cesium.Cartesian3.negate(toEarth, new Cesium.Cartesian3());

      // Heading velocity vector along orbit
      const nextTime = Cesium.JulianDate.addSeconds(currentTime, 1.0, new Cesium.JulianDate());
      const nextPos = window.appOrbit.iss3D.position.getValue(nextTime);
      let velDir;
      if (nextPos) {
        velDir = Cesium.Cartesian3.normalize(
          Cesium.Cartesian3.subtract(nextPos, issPos, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        );
      } else {
        velDir = Cesium.Cartesian3.UNIT_Z;
      }

      // Lateral vector (starboard)
      const sideDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(velDir, zenith, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      // Camera sits perched atop the ISS truss on the zenith side, slightly aft (-velDir) and starboard:
      // +520m zenith (above truss hull), -450m along velocity (aft of center), +160m starboard.
      const targetCamPos = Cesium.Cartesian3.add(
        issPos,
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(zenith, 520.0, new Cesium.Cartesian3()),
          Cesium.Cartesian3.add(
            Cesium.Cartesian3.multiplyByScalar(velDir, -450.0, new Cesium.Cartesian3()),
            Cesium.Cartesian3.multiplyByScalar(sideDir, 160.0, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
          ),
          new Cesium.Cartesian3()
        ),
        new Cesium.Cartesian3()
      );

      // Looking forward across the station modules and downward towards Earth surface & horizon:
      const targetLookDir = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.add(
          Cesium.Cartesian3.multiplyByScalar(velDir, 1.45, new Cesium.Cartesian3()),
          Cesium.Cartesian3.multiplyByScalar(toEarth, 0.75, new Cesium.Cartesian3()),
          new Cesium.Cartesian3()
        ),
        new Cesium.Cartesian3()
      );

      // Up vector towards space/zenith
      const targetRight = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(targetLookDir, zenith, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      const targetUp = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(targetRight, targetLookDir, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );

      const elapsed = performance.now() - startTimeMs;
      const linearP = Math.min(1.0, elapsed / transitionMs);
      const easeP = linearP < 0.5 
        ? 4 * linearP * linearP * linearP 
        : 1 - Math.pow(-2 * linearP + 2, 3) / 2;

      let curPos, curDir, curUp;
      if (easeP < 1.0) {
        curPos = Cesium.Cartesian3.lerp(startCamPos, targetCamPos, easeP, new Cesium.Cartesian3());
        curDir = Cesium.Cartesian3.lerp(startCamDir, targetLookDir, easeP, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(curDir, curDir);
        curUp = Cesium.Cartesian3.lerp(startCamUp, targetUp, easeP, new Cesium.Cartesian3());
        Cesium.Cartesian3.normalize(curUp, curUp);
      } else {
        curPos = targetCamPos;
        curDir = targetLookDir;
        curUp = targetUp;
      }

      const curRight = Cesium.Cartesian3.normalize(
        Cesium.Cartesian3.cross(curDir, curUp, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      );
      Cesium.Cartesian3.cross(curRight, curDir, curUp);
      Cesium.Cartesian3.normalize(curUp, curUp);

      viewer3D.camera.position = curPos;
      viewer3D.camera.direction = curDir;
      viewer3D.camera.up = curUp;
      viewer3D.camera.right = curRight;
    });
  }

  function returnToGlobalOrbit() {
    if (window.appViewers && window.appViewers.setSimulationCamera) {
      window.appViewers.setSimulationCamera(1.8);
      setActiveDockBtn('camGlobal');
    }
  }

  if (btnEarthView) {
    btnEarthView.addEventListener('click', () => {
      if (isEarthView) {
        disableEarthView();
        returnToGlobalOrbit();
      } else {
        activateEarthView();
      }
    });
  }

  if (btnHullView) {
    btnHullView.addEventListener('click', () => {
      if (isHullView) {
        disableHullView();
        returnToGlobalOrbit();
      } else {
        activateHullView();
      }
    });
  }

  if (btnTrackISS) {
    btnTrackISS.addEventListener('click', () => {
      disableEarthView();
      disableHullView();
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
        returnToGlobalOrbit();
      }
    });
  }

  function unbindCameraTracking() {
    disableEarthView();
    disableHullView();
    if (isTracking) {
      isTracking = false;
      viewer3D.trackedEntity = undefined;
      if (trackLabel) trackLabel.textContent = 'Lock Camera to ISS';
      if (btnTrackISS) btnTrackISS.classList.remove('tracking');
    }
  }

  function setTrackedState(state) {
    disableEarthView();
    disableHullView();
    isTracking = !!state;
    if (isTracking) {
      if (trackLabel) trackLabel.textContent = 'Unbind Camera';
      if (btnTrackISS) btnTrackISS.classList.add('tracking');
      setActiveDockBtn('');
    } else {
      if (trackLabel) trackLabel.textContent = 'Lock Camera to ISS';
      if (btnTrackISS) btnTrackISS.classList.remove('tracking');
      returnToGlobalOrbit();
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
      if (window.appViewers && window.appViewers.fit2DWorld) {
        window.appViewers.fit2DWorld(0);
      }
    }, 30);
    setTimeout(() => {
      clearInterval(interval);
      viewer3D.resize();
      viewer2D.resize();
      if (window.appViewers && window.appViewers.fit2DWorld) {
        window.appViewers.fit2DWorld(0);
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
        if (window.appViewers && window.appViewers.fit2DWorld) {
          window.appViewers.fit2DWorld(0);
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDividerDragging) {
        isDividerDragging = false;
        document.body.style.cursor = '';
        viewer2D.resize();
        viewer3D.resize();
        if (window.appViewers && window.appViewers.fit2DWorld) {
          window.appViewers.fit2DWorld(0);
        }
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
