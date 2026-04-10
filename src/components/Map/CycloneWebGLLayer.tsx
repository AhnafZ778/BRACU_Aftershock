import { useEffect, useRef, useState } from "react";
import { useMap, Polyline } from "react-leaflet";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { useSimulationStore } from "../../store/useSimulationStore";
import { useAppStore } from "../../store/useAppStore";

/* ─────────────────────────────────────────────────────────────────────────────
   Geographic scaling helper
   Converts km → CSS pixels at the storm's current lat/lon and zoom level
   using Leaflet's own projection math so the result is always exact.
   In Web Mercator, 1 degree longitude = 111.32 * cos(lat) km.
   Leaflet's latLngToContainerPoint gives us the pixel width of 1 degree,
   so we divide to get pixels-per-km. This is called every RAF frame so the
   storm scales instantly and correctly during zoom and pan.
───────────────────────────────────────────────────────────────────────────── */
function getPixelsPerKm(
  map: import("leaflet").Map,
  lat: number,
  lon: number,
): number {
  const p1 = map.latLngToContainerPoint([lat, lon]);
  const p2 = map.latLngToContainerPoint([lat, lon + 1.0]);
  const pixelsPerDegLon = Math.abs(p2.x - p1.x);
  const kmPerDegLon = 111.32 * Math.cos((lat * Math.PI) / 180);
  return pixelsPerDegLon / kmPerDegLon;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/* ─────────────────────────────────────────────────────────────────────────────
   GLSL — Convective IR Satellite shader
   Exact port of the cyclone.html shader with one extra `dissipation` uniform
   that lets us gracefully fade the storm as it moves over land.
───────────────────────────────────────────────────────────────────────────── */
const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float time;
  uniform float intensity;
  uniform float dissipation;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 uv  = vUv - 0.5;
    float dist  = length(uv) * 2.0;
    float angle = atan(uv.y, uv.x);

    /* Animated spiral cloud bands */
    float spiral = noise(vec2(
      dist  * 8.0 - time * 2.0,
      angle * 3.0 + dist * 4.0
    ));

    /* Eye clearing — shrinks with intensity so a weaker storm has no clear eye */
    float eye   = smoothstep(0.12 * intensity, 0.22 * intensity, dist);
    float power = (1.0 - dist) * spiral * eye;

    /* Enhanced IR colour ramp — coldest tops (deepest convection) → warmest */
    vec3 col = vec3(1.0);
    if      (power > 0.8)  col = mix(vec3(0.60, 0.00, 0.60), vec3(0.30, 0.00, 0.40), (power - 0.80) * 5.0);
    else if (power > 0.6)  col = mix(vec3(1.00, 0.00, 0.00), vec3(0.60, 0.00, 0.60), (power - 0.60) * 5.0);
    else if (power > 0.4)  col = mix(vec3(1.00, 0.60, 0.00), vec3(1.00, 0.00, 0.00), (power - 0.40) * 5.0);
    else if (power > 0.2)  col = mix(vec3(0.00, 0.80, 0.00), vec3(1.00, 0.60, 0.00), (power - 0.20) * 5.0);
    else if (power > 0.05) col = mix(vec3(0.60, 0.80, 1.00), vec3(0.00, 0.80, 0.00), (power - 0.05) * 6.6);

    float alpha = smoothstep(1.0, 0.4, dist) * smoothstep(0.0, 0.1, power);

    /* dissipation drives overall opacity down as the storm moves over land */
    gl_FragColor = vec4(col, alpha * intensity * 1.5 * dissipation);
  }
`;

/* ─────────────────────────────────────────────────────────────────────────────
   Build the canvas-based atmosphere halo texture (white radial gradient)
───────────────────────────────────────────────────────────────────────────── */
function buildAtmosphereTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/* ─────────────────────────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────────────────────────── */
export function CycloneWebGLLayer() {
  const map = useMap();
  const cancelledRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  /* Trail rendered as a react-leaflet Polyline — initialised from current state */
  const [trailPositions, setTrailPositions] = useState<[number, number][]>(
    () => {
      const s = useSimulationStore.getState();
      const out: [number, number][] = [];
      for (let i = 0; i <= s.currentStep; i++) {
        const step = s.timeline[i];
        if (step?.storm_center)
          out.push([step.storm_center[0], step.storm_center[1]]);
      }
      return out;
    },
  );

  /* ── Main Three.js setup — runs once when map instance is available ───────── */
  useEffect(() => {
    const container = map.getContainer();

    /* Guard: bail if container has no size yet (shouldn't happen but be safe) */
    const W = Math.max(container.clientWidth, 400);
    const H = Math.max(container.clientHeight, 300);

    /* ── Canvas ──────────────────────────────────────────────────────────────── */
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.zIndex = "2000";
    canvas.style.pointerEvents = "none";
    /* Screen blend: WebGL colours ADD to the Leaflet tiles below, producing glow */
    (
      canvas.style as CSSStyleDeclaration & Record<string, string>
    ).mixBlendMode = "screen";
    container.appendChild(canvas);

    /* ── Renderer ────────────────────────────────────────────────────────────── */
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(W, H); /* sets canvas CSS px + buffer px */
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap pixel ratio to fix severe lag
    renderer.setClearColor(0x000000, 0);

    /* ── Scene & Orthographic Camera ─────────────────────────────────────────── */
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      W / -2,
      W / 2,
      H / 2,
      H / -2,
      0.1,
      1000,
    );
    camera.position.z = 100;

    /* ── Post-processing: soft bloom (mimics satellite glow) ─────────────────── */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(W, H),
      0.5 /* strength  — matches cyclone.html */,
      0.5 /* radius    — matches cyclone.html */,
      0.1 /* threshold */,
    );
    composer.addPass(bloom);
    /* OutputPass: required in Three.js r152+ to correctly convert linear → sRGB
       before writing to the canvas. Without it colours render incorrectly dim. */
    composer.addPass(new OutputPass());

    /* ── Storm mesh size: proportional to container, calibrated to cyclone.html
          cyclone.html uses 600px mesh at ~1920px screen → 31.25% of width.
          We use W * 0.31 so the storm is the same fraction of the map viewport. */
    const meshBaseSize = Math.min(480, Math.max(180, W * 0.31));

    /* ── IR shader material ──────────────────────────────────────────────────── */
    const stormUniforms = {
      time: { value: 0.0 },
      intensity: { value: 0.0 },
      dissipation: { value: 1.0 },
    };
    const stormMat = new THREE.ShaderMaterial({
      uniforms: stormUniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const stormMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(meshBaseSize, meshBaseSize),
      stormMat,
    );

    /* ── Atmosphere halo — subtle white radial glow behind the eye ───────────── */
    const atmoTex = buildAtmosphereTexture();
    const atmoMat = new THREE.MeshBasicMaterial({
      map: atmoTex,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const atmoMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(meshBaseSize * 1.45, meshBaseSize * 1.45),
      atmoMat,
    );
    atmoMesh.position.z = -1;

    /* Group so position + scale affect both meshes together */
    const stormGroup = new THREE.Group();
    stormGroup.add(stormMesh);
    stormGroup.add(atmoMesh);
    stormGroup.visible = false;
    scene.add(stormGroup);

    /* ── Animated state — lerped each frame (smooth between 1.5 s store steps) ─ */
    let visIntensity = 0.0;
    let visGeoScale = 0.01; // geographic scale: drives the group size in km-space
    let visDissipation = 1.0;
    let visLat: number | null = null;
    let visLon: number | null = null;
    let lastTime = performance.now();
    let internalStep: number | null = null;

    /* ── sync: project geo-coords onto the Three.js orthographic canvas ─────── */
    function sync(lat: number, lon: number): void {
      const cW = container.clientWidth;
      const cH = container.clientHeight;
      const pt = map.latLngToContainerPoint([lat, lon]);
      stormGroup.position.x = pt.x - cW / 2;
      stormGroup.position.y = -(pt.y - cH / 2);
    }

    /* ── Resize: keep renderer, camera, and composer in sync with container ──── */
    function onResize(): void {
      const nW = container.clientWidth;
      const nH = container.clientHeight;
      renderer.setSize(nW, nH);
      camera.left = nW / -2;
      camera.right = nW / 2;
      camera.top = nH / 2;
      camera.bottom = nH / -2;
      camera.updateProjectionMatrix();
      composer.setSize(nW, nH);
      // Removed sync() call here to prevent racing with requestAnimationFrame
    }

    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    /* ── Map move/zoom: empty out race-condition sync calls completely ───────── */
    function onMapMove(): void {
      // Intentionally left blank. The requestAnimationFrame loop handles positioning smoothly.
    }
    map.on("move", onMapMove);
    map.on("zoom", onMapMove);

    /* ── RAF loop ─────────────────────────────────────────────────────────────── */
    cancelledRef.current = false;

    function loop(): void {
      if (cancelledRef.current) return;
      rafRef.current = requestAnimationFrame(loop);

      const now = performance.now();
      // Calculate delta time, capped at 0.1s to prevent explosions on heavy lag/tab out
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      /* Read store imperatively — zero React re-renders, zero overhead */
      const st = useSimulationStore.getState();
      const currentStepIdx = st.currentStep;

      if (internalStep === null || !st.isPlaying) {
        internalStep = currentStepIdx;
      } else {
        internalStep += dt / 1.5;
        // Smooth bounds checking instead of harsh jumps
        if (internalStep < currentStepIdx) {
          // If we fell behind the store (e.g. tab inactive), smoothly accelerate
          internalStep += (currentStepIdx - internalStep) * dt * 5.0;
        } else if (internalStep > currentStepIdx + 1.0) {
          // If we got ahead (setInterval late), pause and wait for store
          internalStep = currentStepIdx + 1.0;
        }
      }

      const evalIdx = Math.min(Math.floor(internalStep), st.timeline.length - 1);
      const fraction = internalStep - evalIdx;
      const step = st.timeline[evalIdx];
      const nextStep = st.timeline[Math.min(evalIdx + 1, st.timeline.length - 1)];

      let targetIntensity = 0.0;
      let targetDissipation = 1.0;
      let targetGeoScale = 0.01;
      let hasPosition = false;

      if (st.isLoaded && step?.storm_center) {
        let rawLat = step.storm_center[0];
        let rawLon = step.storm_center[1];
        hasPosition = true;

        if (st.isPlaying && nextStep?.storm_center && evalIdx < st.timeline.length - 1) {
          rawLat = lerp(rawLat, nextStep.storm_center[0], fraction);
          rawLon = lerp(rawLon, nextStep.storm_center[1], fraction);
        }

        if (visLat === null || visLon === null) {
          visLat = rawLat;
          visLon = rawLon;
        } else {
          // Smoothly animate the geographical center position
          // Smooth track heavily during playback to eliminate sharp corner bounds
          const lerpPos = st.isPlaying ? (1 - Math.exp(-12.0 * dt)) : (1 - Math.exp(-6.0 * dt));
          visLat = lerp(visLat, rawLat, lerpPos);
          visLon = lerp(visLon, rawLon, lerpPos);
        }

        const windKt = step.storm_wind_kt ?? 0;
        /* Normalise to [0,1] — 130 kt is slightly above Sidr's 115 kt peak
           so the shader never hard-clamps and always has visual headroom.    */
        const baseIntensity = clamp01(windKt / 130);

        /* ── Dissipation — drives the storm's visual decay over land ──────────
           Over open water the storm looks fully formed.
           At landfall it begins to shred: spiral bands become ragged,
           the eye fills, and the overall glow fades.
           We compound this with the natural wind_kt drop so the two effects
           reinforce each other rather than doubling up.                       */
        const phase = step.phase ?? "";

        if (phase === "Landfall") {
          /* Just touching land — full visual, natural wind intensity drives size */
          targetDissipation = 1.0;
        } else if (phase === "Inland Transit") {
          /* Storm is over land. dissipation tracks remaining wind strength
             but is forced below 0.80 so the viewer always sees visible decay. */
          targetDissipation = Math.max(
            0.3,
            Math.min(0.78, baseIntensity * 1.15),
          );
        } else if (phase === "Dissipating") {
          /* Remnant low — barely visible, mostly faded */
          targetDissipation = Math.max(0.04, baseIntensity * 0.45);
        } else {
          /* Formation / Approaching / Imminent — full intensity over water */
          targetDissipation = 1.0;
        }

        targetIntensity = baseIntensity;

        /* ── Geographic scale ────────────────────────────────────────────────
           Storm radius in km is calibrated to real tropical-cyclone data:
             15 kt  (formation)  →  ~32 km  — tiny dot at the storm's birth
             65 kt  (moderate)   →  ~88 km  — clearly visible circulation
             115 kt (Cat-5 peak) → ~144 km  — large but factually bounded
           We multiply by 2 for diameter, divide by meshBaseSize to get the
           Three.js group scale factor. Because getPixelsPerKm queries
           Leaflet's live projection, zooming automatically shrinks/grows the
           storm on screen while it always covers the same real-world area.  */
        const visualRadiusKm = 15 + (windKt / 130) * 145;
        // Use smooth position for px per km sampling to avoid snapping
        const pxPerKm = getPixelsPerKm(map, visLat, visLon);
        targetGeoScale = (visualRadiusKm * 2.0 * pxPerKm) / meshBaseSize;
      }
      /* Smooth lerp toward targets using dt for framerate-independent speed */
      const lerpScale = 1 - Math.exp(-8.0 * dt);
      const lerpIntens = 1 - Math.exp(-2.5 * dt);
      
      visIntensity = lerp(visIntensity, targetIntensity, lerpIntens);
      visGeoScale = lerp(visGeoScale, targetGeoScale, lerpScale);
      visDissipation = lerp(visDissipation, targetDissipation, lerpIntens);

      /* Update shader uniforms */
      /* Spin rate scales with storm intensity — faster at peak, calmer when weak */
      const speedFactor = 0.5 + visIntensity * 2.0;
      stormUniforms.time.value += dt * 0.6 * speedFactor;
      stormUniforms.intensity.value = 0.4 + visIntensity * 0.6;

      /* ── Visualization Mode ────────────────────────────────────────────────
         full    = Original IR-satellite shader with bloom + atmosphere halo
         reduced = Dimmed shader, bloom off, no atmosphere — honeycombs readable
         off     = Storm completely hidden (canvas hidden), only hex grid visible */
      const visMode = useAppStore.getState().cycloneVisMode;

      if (visMode === 'off') {
        // Completely hide — skip rendering entirely
        canvas.style.display = 'none';
        stormGroup.visible = false;
        return;
      }
      canvas.style.display = '';

      if (visMode === 'reduced') {
        stormUniforms.dissipation.value = Math.min(visDissipation * 0.25, 0.25);
        bloom.enabled = false;
        atmoMat.opacity = 0;
      } else {
        // full mode
        stormUniforms.dissipation.value = visDissipation;
        bloom.enabled = true;
        atmoMat.opacity = visIntensity * 0.11 * visDissipation;
      }

      /* Scale the whole group — geographic km-based, zoom-aware */
      stormGroup.scale.set(visGeoScale, visGeoScale, 1);

      /* Hide completely when effectively invisible */
      stormGroup.visible = visIntensity > 0.015 && visGeoScale > 0.02;

      /* Re-anchor to map geo-position (uses the perfectly smooth visLat/visLon) */
      if (hasPosition && visLat !== null && visLon !== null) {
        sync(visLat, visLon);
      }

      composer.render();
    }

    rafRef.current = requestAnimationFrame(loop);

    /* ── Store subscription for trail updates ────────────────────────────────── */
    const unsubTrail = useSimulationStore.subscribe((state) => {
      const positions: [number, number][] = [];
      for (let i = 0; i <= state.currentStep; i++) {
        const s = state.timeline[i];
        if (s?.storm_center) {
          positions.push([s.storm_center[0], s.storm_center[1]] as [
            number,
            number,
          ]);
        }
      }
      setTrailPositions(positions);
    });

    /* ── Cleanup ─────────────────────────────────────────────────────────────── */
    return () => {
      cancelledRef.current = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      map.off("move", onMapMove);
      map.off("zoom", onMapMove);
      resizeObserver.disconnect();
      unsubTrail();

      /* Dispose all Three.js resources to prevent GPU memory leaks */
      stormMesh.geometry.dispose();
      stormMat.dispose();
      atmoMesh.geometry.dispose();
      atmoMat.dispose();
      atmoTex.dispose();
      composer.dispose();
      renderer.dispose();

      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, [map]);

  /* ── Trail — rendered as a Leaflet Polyline via react-leaflet ────────────────
     Aesthetics match cyclone.html: ultra-thin white ghost line, no dash,
     slightly more opaque than the original 0.05 since we don't have full-screen
     WebGL bloom brightening the whole scene.                                    */
  return trailPositions.length >= 2 ? (
    <Polyline
      positions={trailPositions}
      pathOptions={{
        color: "rgba(255, 255, 255, 0.18)",
        weight: 1.5,
        lineCap: "round",
        lineJoin: "round",
      }}
    />
  ) : null;
}
