(() => {
  'use strict';

  const { viewer3D, viewer2D, setSimulationCamera, zoomToISS, flyToLandingCamera } = window.appViewers;
  let isLandingActive = true;

  // Медленное вращение Земли на лендинге
  viewer3D.scene.preRender.addEventListener(() => {
    if (isLandingActive && !viewer3D.trackedEntity) {
      viewer3D.scene.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.00022);
    }
  });

  // Входная анимация при загрузке страницы
  function initLandingEntrance() {
    if (!window.gsap) return;

    gsap.fromTo('.title-primary',
      { z: 250, scale: 1.35, opacity: 0, filter: 'blur(12px)' },
      { z: 0, scale: 1, opacity: 1, filter: 'blur(0px)', duration: 1.4, ease: 'power3.out' }
    );

    gsap.fromTo('.title-spaced',
      { z: 200, scale: 1.25, opacity: 0, filter: 'blur(10px)' },
      { z: 0, scale: 1, opacity: 1, filter: 'blur(0px)', duration: 1.4, delay: 0.12, ease: 'power3.out' }
    );

    gsap.fromTo('.landing-desc',
      { y: 25, opacity: 0, filter: 'blur(6px)' },
      { y: 0, opacity: 1, filter: 'blur(0px)', duration: 1.1, delay: 0.28, ease: 'power2.out' }
    );

    gsap.fromTo('.landing-action',
      { scale: 0.85, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.9, delay: 0.45, ease: 'back.out(1.5)' }
    );

    gsap.fromTo('.landing-header',
      { y: -30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.9, delay: 0.15, ease: 'power2.out' }
    );

    gsap.fromTo('.landing-footer',
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.9, delay: 0.15, ease: 'power2.out' }
    );
  }

  // Переход в симулятор: сначала стремительное приближение к Земле вместе с вылетом текста, затем плавный откат к общему обзору
  function launchSimulation(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!isLandingActive) return;
    isLandingActive = false;

    // 1. 3D анимация текста "на зрителя" (fly towards camera)
    if (window.gsap) {
      gsap.to('.landing-action', {
        scale: 0.85,
        opacity: 0,
        duration: 0.35,
        ease: 'power2.in'
      });

      gsap.to('.title-primary', {
        z: 650,
        scale: 2.7,
        opacity: 0,
        filter: 'blur(22px)',
        duration: 1.15,
        ease: 'power3.in'
      });

      gsap.to('.title-spaced', {
        z: 550,
        scale: 2.3,
        opacity: 0,
        filter: 'blur(18px)',
        duration: 1.1,
        delay: 0.05,
        ease: 'power3.in'
      });

      gsap.to('.landing-desc', {
        z: 420,
        scale: 1.9,
        opacity: 0,
        filter: 'blur(14px)',
        duration: 0.95,
        delay: 0.1,
        ease: 'power3.in'
      });

      gsap.to('.landing-header', {
        y: -40,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.in'
      });

      gsap.to('.landing-footer', {
        y: 40,
        opacity: 0,
        duration: 0.6,
        ease: 'power2.in'
      });
    }

    // 2. Плавный зум к Земле (общий вид симулятора)
    setSimulationCamera(2.2, () => {
      viewer3D.resize();
      viewer2D.resize();
    });

    // 3. Открытие интерфейса симулятора
    setTimeout(() => {
      document.body.classList.remove('landing-active');
    }, 400);

    setTimeout(() => {
      const hero = document.getElementById('landingHero');
      if (hero) hero.style.display = 'none';
      viewer3D.resize();
      viewer2D.resize();
    }, 900);

    const resizeInterval = setInterval(() => {
      viewer3D.resize();
      viewer2D.resize();
    }, 50);

    setTimeout(() => {
      clearInterval(resizeInterval);
      viewer3D.resize();
      viewer2D.resize();
    }, 2400);
  }

  // Возврат на титульный экран
  function backToLanding(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isLandingActive) return;
    isLandingActive = true;

    if (window.appUI && window.appUI.unbindCameraTracking) {
      window.appUI.unbindCameraTracking();
    }

    const hero = document.getElementById('landingHero');
    if (hero) {
      hero.style.display = 'flex';
      hero.style.opacity = '1';
      hero.style.pointerEvents = 'auto';
    }
    document.body.classList.add('landing-active');

    // Камера возвращается к горизонту полуземли
    flyToLandingCamera(2.2, () => {
      viewer3D.resize();
    });

    // 3D анимация возвращения текста
    if (window.gsap) {
      gsap.fromTo('.landing-action',
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.8, delay: 0.35, ease: 'back.out(1.4)' }
      );

      gsap.fromTo('.title-primary',
        { z: 500, scale: 2.2, opacity: 0, filter: 'blur(20px)' },
        { z: 0, scale: 1, opacity: 1, filter: 'blur(0px)', duration: 1.15, ease: 'power3.out' }
      );

      gsap.fromTo('.title-spaced',
        { z: 400, scale: 1.9, opacity: 0, filter: 'blur(16px)' },
        { z: 0, scale: 1, opacity: 1, filter: 'blur(0px)', duration: 1.1, delay: 0.08, ease: 'power3.out' }
      );

      gsap.fromTo('.landing-desc',
        { z: 300, scale: 1.6, opacity: 0, filter: 'blur(12px)' },
        { z: 0, scale: 1, opacity: 1, filter: 'blur(0px)', duration: 1.0, delay: 0.16, ease: 'power3.out' }
      );

      gsap.fromTo('.landing-header',
        { y: -40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, delay: 0.2, ease: 'power2.out' }
      );

      gsap.fromTo('.landing-footer',
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, delay: 0.2, ease: 'power2.out' }
      );
    }

    const resizeInterval = setInterval(() => {
      viewer3D.resize();
      viewer2D.resize();
    }, 50);

    setTimeout(() => {
      clearInterval(resizeInterval);
      viewer3D.resize();
      viewer2D.resize();
    }, 1100);
  }

  function bindControls() {
    const btnLaunchMission = document.getElementById('btnLaunchMission');
    if (btnLaunchMission) {
      btnLaunchMission.onclick = launchSimulation;
    }

    const btnBackToHome = document.getElementById('btnBackToHome');
    if (btnBackToHome) {
      btnBackToHome.onclick = backToLanding;
    }

    initLandingEntrance();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindControls);
  } else {
    bindControls();
  }

  window.launchSimulation = launchSimulation;
  window.backToLanding = backToLanding;
})();
