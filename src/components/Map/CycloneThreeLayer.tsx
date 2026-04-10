import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { convectiveShader } from './CycloneShader';

interface CyclonePos {
  lat: number;
  lon: number;
  wind: number;
  category: string;
  color: string;
}

export type VisualizationMode = 'full' | 'minimalist';

export function CycloneThreeLayer({
  currentPos,
  visualizationMode = 'full',
}: {
  currentPos: CyclonePos | null;
  visualizationMode?: VisualizationMode;
}) {
  const map = useMap();
  const currentPosRef = useRef<CyclonePos | null>(currentPos);
  const modeRef = useRef<VisualizationMode>(visualizationMode);

  // Keep refs up to date without triggering WebGL re-initialization
  useEffect(() => {
    currentPosRef.current = currentPos;
  }, [currentPos]);

  useEffect(() => {
    modeRef.current = visualizationMode;
  }, [visualizationMode]);

  useEffect(() => {
    if (!map) return;

    // ── Container ──
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '1000';
    // Critical: screen blending makes dark shader areas transparent over the map
    container.style.mixBlendMode = 'screen';
    map.getContainer().appendChild(container);

    // ── Scene + Camera ──
    const scene = new THREE.Scene();

    const w = map.getContainer().clientWidth;
    const h = map.getContainer().clientHeight;
    const camera = new THREE.OrthographicCamera(
      w / -2, w / 2, h / 2, h / -2, 0, 1000
    );
    camera.position.z = 10;

    // ── Renderer (transparent background) ──
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // ── Post-processing: EffectComposer + UnrealBloomPass ──
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      0.5,   // strength (matching cyclone.html)
      0.5,   // radius
      0.1    // threshold
    );
    composer.addPass(bloomPass);

    // ── Storm Group ──
    const storm = new THREE.Group();
    scene.add(storm);

    // ── Atmosphere Halo (radial gradient disc behind the storm) ──
    const atmosCanvas = document.createElement('canvas');
    atmosCanvas.width = 256;
    atmosCanvas.height = 256;
    const ctx = atmosCanvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(100, 180, 255, 0.15)');
    gradient.addColorStop(0.5, 'rgba(60, 120, 220, 0.06)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);

    const atmosTexture = new THREE.CanvasTexture(atmosCanvas);
    const atmosMaterial = new THREE.MeshBasicMaterial({
      map: atmosTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.1,
    });
    const atmosGeometry = new THREE.PlaneGeometry(800, 800);
    const atmosMesh = new THREE.Mesh(atmosGeometry, atmosMaterial);
    atmosMesh.position.z = -1; // Behind the main spiral
    storm.add(atmosMesh);

    // ── Main Convective Spiral ──
    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(convectiveShader.uniforms),
      vertexShader: convectiveShader.vertexShader,
      fragmentShader: convectiveShader.fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(600, 600);
    const mesh = new THREE.Mesh(geometry, material);
    storm.add(mesh);

    // ── Sync position to map coordinates ──
    const syncPosition = () => {
      const pos = currentPosRef.current;
      const mode = modeRef.current;

      if (!pos) {
        storm.visible = false;
        return;
      }
      storm.visible = true;

      const p = map.latLngToContainerPoint([pos.lat, pos.lon]);
      storm.position.x = p.x - renderer.domElement.clientWidth / 2;
      storm.position.y = -(p.y - renderer.domElement.clientHeight / 2);

      // Normalized intensity (0.0 to ~1.0)
      const intensity = pos.wind / 260;

      // cyclone.html formula: 0.4 + intensity * 0.6 (range 0.4–1.0)
      const shaderIntensity = 0.4 + Math.min(intensity, 1.0) * 0.6;

      // Zoom-dependent scale
      const zoomScale = Math.pow(2, map.getZoom() - 6);

      // cyclone.html: 0.5 + intensity * 1.5
      const windScale = 0.5 + intensity * 1.5;

      material.uniforms.intensity.value = shaderIntensity;
      const finalScale = windScale * zoomScale;

      // Smooth interpolation for scale
      storm.scale.lerp(new THREE.Vector3(finalScale, finalScale, 1), 0.1);

      // ── Mode-dependent adjustments ──
      if (mode === 'minimalist') {
        material.uniforms.globalAlpha.value = 0.2;
        bloomPass.enabled = false;
        atmosMesh.visible = false;
      } else {
        material.uniforms.globalAlpha.value = 1.0;
        bloomPass.enabled = true;
        atmosMesh.visible = true;
      }
    };

    // ── Animation loop ──
    let animationId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      animationId = requestAnimationFrame(render);
      const delta = time - lastTime;
      lastTime = time;

      const pos = currentPosRef.current;
      if (pos) {
        const speedFactor = 0.5 + (pos.wind / 100);
        material.uniforms.time.value += (delta * 0.001) * speedFactor;
      } else {
        material.uniforms.time.value += (delta * 0.001);
      }

      syncPosition();
      composer.render(); // Use composer instead of renderer.render()
    };

    render(performance.now());

    // ── Resize handler ──
    const onResize = () => {
      const width = map.getContainer().clientWidth;
      const height = map.getContainer().clientHeight;
      renderer.setSize(width, height);
      composer.setSize(width, height);
      camera.left = width / -2;
      camera.right = width / 2;
      camera.top = height / 2;
      camera.bottom = height / -2;
      camera.updateProjectionMatrix();
      syncPosition();
    };

    map.on('move', syncPosition);
    map.on('zoom', syncPosition);
    window.addEventListener('resize', onResize);

    onResize();

    // ── Cleanup ──
    return () => {
      cancelAnimationFrame(animationId);
      map.off('move', syncPosition);
      map.off('zoom', syncPosition);
      window.removeEventListener('resize', onResize);
      container.remove();
      renderer.dispose();
      composer.dispose();
      material.dispose();
      geometry.dispose();
      atmosMaterial.dispose();
      atmosGeometry.dispose();
      atmosTexture.dispose();
    };
  }, [map]);

  return null; // Renders directly into map container DOM via effects
}
