(() => {
  'use strict';

  Cesium.Ion.defaultAccessToken = '';

  function createSatelliteLayer() {
    return Cesium.ImageryLayer.fromProviderAsync(
      Cesium.ArcGisMapServerImageryProvider.fromUrl(
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
      )
    );
  }

  const viewer3D = new Cesium.Viewer('cesium3D', {
    sceneMode: Cesium.SceneMode.SCENE3D,
    baseLayer: createSatelliteLayer(),
    geocoder: false,
    baseLayerPicker: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false
  });
  viewer3D.scene.globe.enableLighting = false;

  const LANDING_CAM = {
    destination: Cesium.Cartesian3.fromDegrees(25.0, 0.0, 9500000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-64),
      roll: 0.0
    }
  };

  const DIVE_CAM = {
    destination: Cesium.Cartesian3.fromDegrees(32.0, 18.0, 3800000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-72),
      roll: 0.0
    }
  };

  const GLOBAL_SIM_CAM = {
    destination: Cesium.Cartesian3.fromDegrees(0.0, 15.0, 22500000),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-89.5),
      roll: 0.0
    }
  };

  function setLandingCamera() {
    viewer3D.camera.setView(LANDING_CAM);
  }
  setLandingCamera();

  function setSimulationCamera(duration = 2.0, onComplete = null) {
    if (typeof duration === 'function') {
      onComplete = duration;
      duration = 2.0;
    }
    viewer3D.camera.flyTo({
      destination: GLOBAL_SIM_CAM.destination,
      orientation: GLOBAL_SIM_CAM.orientation,
      duration: duration || 2.0,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      complete: onComplete
    });
  }

  function zoomToISS(duration = 2.0, onComplete = null) {
    setSimulationCamera(duration, onComplete);
  }

  function flyToLandingCamera(duration = 2.0, onComplete = null) {
    viewer3D.camera.flyTo({
      destination: LANDING_CAM.destination,
      orientation: LANDING_CAM.orientation,
      duration,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      complete: onComplete
    });
  }

  const viewer2D = new Cesium.Viewer('cesium2D', {
    sceneMode: Cesium.SceneMode.SCENE2D,
    clockViewModel: viewer3D.clockViewModel,
    baseLayer: createSatelliteLayer(),
    geocoder: false,
    baseLayerPicker: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false
  });
  viewer2D.scene.globe.enableLighting = false;

  if (viewer2D.scene && viewer2D.scene.screenSpaceCameraController) {
    viewer2D.scene.screenSpaceCameraController.enableTilt = false;
    viewer2D.scene.screenSpaceCameraController.enableRotate = false;
  }

  function fit2DWorld() {
    viewer2D.camera.flyTo({
      destination: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
      duration: 1.2
    });
  }
  viewer2D.camera.setView({
    destination: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90)
  });

  window.appViewers = {
    viewer3D,
    viewer2D,
    setLandingCamera,
    setSimulationCamera,
    zoomToISS,
    flyToLandingCamera,
    fit2DWorld
  };
})();
