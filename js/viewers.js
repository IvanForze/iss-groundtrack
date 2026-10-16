Cesium.Ion.defaultAccessToken = '';

function createSatelliteLayer() {
  return Cesium.ImageryLayer.fromProviderAsync(
    Cesium.ArcGisMapServerImageryProvider.fromUrl(
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
    )
  );
}

export const viewer3D = new Cesium.Viewer('cesium3D', {
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

export const LANDING_CAM = {
  destination: Cesium.Cartesian3.fromDegrees(25.0, 0.0, 9500000),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-64),
    roll: 0.0
  }
};

export const DIVE_CAM = {
  destination: Cesium.Cartesian3.fromDegrees(32.0, 18.0, 3800000),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-72),
    roll: 0.0
  }
};

export const GLOBAL_SIM_CAM = {
  destination: Cesium.Cartesian3.fromDegrees(0.0, 15.0, 22500000),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-89.5),
    roll: 0.0
  }
};

export function setLandingCamera() {
  viewer3D.camera.setView(LANDING_CAM);
}
setLandingCamera();

export function setSimulationCamera(duration = 2.0, onComplete = null) {
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

export function zoomToISS(duration = 2.0, onComplete = null) {
  setSimulationCamera(duration, onComplete);
}

export function flyToLandingCamera(duration = 2.0, onComplete = null) {
  viewer3D.camera.flyTo({
    destination: LANDING_CAM.destination,
    orientation: LANDING_CAM.orientation,
    duration,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    complete: onComplete
  });
}

export const viewer2D = new Cesium.Viewer('cesium2D', {
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

export function fit2DWorld(duration = 0) {
  const worldRect = Cesium.Rectangle.fromDegrees(-180, -85, 180, 85);
  if (duration && duration > 0) {
    viewer2D.camera.flyTo({
      destination: worldRect,
      duration,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT
    });
  } else {
    viewer2D.camera.setView({
      destination: worldRect
    });
  }
}
fit2DWorld(0);

let isIcrfActive = false;
let icrfListenerRemover = null;

export function setReferenceFrame(mode, onFrameChange = null) {
  const targetInertial = (mode === 'inertial');
  if (targetInertial === isIcrfActive) return;
  isIcrfActive = targetInertial;

  if (isIcrfActive) {
    if (icrfListenerRemover) {
      icrfListenerRemover();
      icrfListenerRemover = null;
    }

    const initialOffset = new Cesium.Cartesian3(0.0, -22000000.0, 16000000.0);
    const initialIcrf = Cesium.Transforms.computeIcrfToFixedMatrix(viewer3D.clock.currentTime) || Cesium.Matrix3.IDENTITY;
    viewer3D.camera.lookAtTransform(
      Cesium.Matrix4.fromRotationTranslation(initialIcrf),
      initialOffset
    );

    icrfListenerRemover = viewer3D.scene.preRender.addEventListener((scene, time) => {
      if (!isIcrfActive || scene.mode !== Cesium.SceneMode.SCENE3D) return;
      const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(time);
      if (Cesium.defined(icrfToFixed)) {
        const offset = Cesium.Cartesian3.clone(viewer3D.camera.position);
        const transform = Cesium.Matrix4.fromRotationTranslation(icrfToFixed);
        viewer3D.camera.lookAtTransform(transform, offset);
      }
    });
  } else {
    if (icrfListenerRemover) {
      icrfListenerRemover();
      icrfListenerRemover = null;
    }
    viewer3D.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    setSimulationCamera(1.5);
  }

  if (typeof onFrameChange === 'function') {
    onFrameChange(isIcrfActive ? 'inertial' : 'fixed');
  }
}

export function toggleReferenceFrame(onFrameChange = null) {
  const newMode = isIcrfActive ? 'fixed' : 'inertial';
  setReferenceFrame(newMode, onFrameChange);
  return newMode;
}

export function isReferenceFrameInertial() {
  return isIcrfActive;
}

export const appViewers = {
  viewer3D,
  viewer2D,
  setLandingCamera,
  setSimulationCamera,
  zoomToISS,
  flyToLandingCamera,
  fit2DWorld,
  setReferenceFrame,
  toggleReferenceFrame,
  isReferenceFrameInertial
};

window.appViewers = appViewers;
