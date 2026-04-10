// CycloneSimulation: Three.js Shader — faithful replica of cyclone.html reference
// IR-satellite color ramp: purple → red → orange → green → blue

export const convectiveShader = {
    uniforms: {
        time: { value: 0 },
        intensity: { value: 0.5 },
        scale: { value: 1.0 },
        globalAlpha: { value: 1.0 },   // mode toggle: 1.0 = full, 0.2 = minimalist
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float time;
        uniform float intensity;
        uniform float scale;
        uniform float globalAlpha;
        varying vec2 vUv;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
                       mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
        }

        void main() {
            vec2 uv = vUv - 0.5;
            float dist = length(uv) * 2.0;

            float angle = atan(uv.y, uv.x);
            float spiral = noise(vec2(dist * 8.0 - time * 2.0, angle * 3.0 + dist * 4.0));

            float eye = smoothstep(0.12 * intensity, 0.22 * intensity, dist);
            float power = (1.0 - dist) * spiral * eye;

            vec3 col = vec3(1.0);

            if (power > 0.8) col = mix(vec3(0.6, 0.0, 0.6), vec3(0.3, 0.0, 0.4), (power-0.8)*5.0);
            else if (power > 0.6) col = mix(vec3(1.0, 0.0, 0.0), vec3(0.6, 0.0, 0.6), (power-0.6)*5.0);
            else if (power > 0.4) col = mix(vec3(1.0, 0.6, 0.0), vec3(1.0, 0.0, 0.0), (power-0.4)*5.0);
            else if (power > 0.2) col = mix(vec3(0.0, 0.8, 0.0), vec3(1.0, 0.6, 0.0), (power-0.2)*5.0);
            else if (power > 0.05) col = mix(vec3(0.6, 0.8, 1.0), vec3(0.0, 0.8, 0.0), (power-0.05)*6.6);

            // Exact cyclone.html alpha formula — wider, softer falloff
            float alpha = smoothstep(1.0, 0.4, dist) * smoothstep(0.0, 0.1, power);

            // cyclone.html intensity multiplier (1.5) with globalAlpha for mode toggle
            gl_FragColor = vec4(col, alpha * intensity * 1.5 * globalAlpha);
        }
    `
};
