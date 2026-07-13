'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A full-bleed <video> rendered through a WebGL fragment shader that distorts the
 * image with cursor-trail ripples — a water-like surface that reacts to mouse move.
 *
 * Raw WebGL (no dependency). Falls back to the plain video element when WebGL is
 * unavailable or the user prefers reduced motion. Tunable constants live up top.
 */
const PLAYBACK_RATE = 0.8; // video speed (1 = normal, 0.5 = half)
const MAX_RIPPLES = 14; // cursor-trail length (shader loop bound)
const RIPPLE_LIFE = 2.2; // seconds a ripple lives
const RIPPLE_AMP = 0.02; // displacement strength (uv units)
const RIPPLE_FREQ = 34.0; // ring density
const RIPPLE_SPEED = 4.5; // outward travel speed
const RIPPLE_FALLOFF = 6.0; // spatial decay
const RIPPLE_DECAY = 1.7; // temporal decay
const ADD_MIN_DIST = 0.012; // min cursor travel (uv) between trail drops
const FADE_GAP_MIN = 16.0; // min seconds between brightness dips
const FADE_GAP_MAX = 38.0; // max seconds between dips
const FADE_DEPTH_MIN = 0.6; // darkest brightness during a dip (1 = unchanged)
const FADE_DEPTH_MAX = 0.78; // shallowest dip
const FADE_HOLD = 1.2; // seconds to linger dim before returning
const FADE_RATE = 0.6; // easing speed (smaller = slower, gentler fade)

const VERT = `
attribute vec2 position;
varying vec2 vUv;
void main(){ vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uTime;
uniform float uCanvasAspect;
uniform float uVideoAspect;
uniform float uBrightness; // global dim factor for the slow fade in/out
uniform vec3 uRipples[${MAX_RIPPLES}]; // xy = uv center, z = start time (<0 = inactive)

const float LIFE = ${RIPPLE_LIFE.toFixed(2)};
const float AMP = ${RIPPLE_AMP.toFixed(3)};
const float FREQ = ${RIPPLE_FREQ.toFixed(1)};
const float SPEED = ${RIPPLE_SPEED.toFixed(1)};
const float FALLOFF = ${RIPPLE_FALLOFF.toFixed(1)};
const float DECAY = ${RIPPLE_DECAY.toFixed(1)};

void main(){
  // Cover-fit: scale uv so the video fills the canvas without stretching.
  vec2 scale = (uCanvasAspect > uVideoAspect)
    ? vec2(1.0, uVideoAspect / uCanvasAspect)
    : vec2(uCanvasAspect / uVideoAspect, 1.0);
  vec2 uv = (vUv - 0.5) * scale + 0.5;

  vec2 disp = vec2(0.0);
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec3 r = uRipples[i];
    if (r.z < 0.0) continue;
    float age = uTime - r.z;
    if (age < 0.0 || age > LIFE) continue;
    vec2 d = vUv - r.xy;
    d.x *= uCanvasAspect; // measure distance in screen space so rings stay round
    float dist = length(d);
    float wave = sin(dist * FREQ - age * SPEED);
    float atten = exp(-dist * FALLOFF) * exp(-age * DECAY) * (1.0 - age / LIFE);
    disp += normalize(d + 1e-6) * wave * atten * AMP;
  }

  // Flip Y for the video texture; subtle chromatic split for a watery refraction.
  vec2 s = vec2(uv.x, 1.0 - uv.y);
  float cr = texture2D(uTex, s + disp * 1.04).r;
  float cg = texture2D(uTex, s + disp).g;
  float cb = texture2D(uTex, s + disp * 0.96).b;
  gl_FragColor = vec4(vec3(cr, cg, cb) * uBrightness, 1.0);
}
`;

export function WaterBackground({ src, className }: { src: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<'video' | 'shader'>('video');

  // Keep the playback rate applied (it resets whenever the source loads).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const apply = () => {
      video.playbackRate = PLAYBACK_RATE;
    };
    apply();
    video.addEventListener('loadedmetadata', apply);
    return () => video.removeEventListener('loadedmetadata', apply);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (reduced || !gl) return; // keep the plain video fallback

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uTime = gl.getUniformLocation(program, 'uTime');
    const uCanvasAspect = gl.getUniformLocation(program, 'uCanvasAspect');
    const uVideoAspect = gl.getUniformLocation(program, 'uVideoAspect');
    const uBrightness = gl.getUniformLocation(program, 'uBrightness');
    const uRipples = gl.getUniformLocation(program, 'uRipples');

    const ripples = new Float32Array(MAX_RIPPLES * 3).fill(-1);
    let head = 0;
    let last = { x: -1, y: -1 };
    const start = performance.now();

    // Slow brightness fade: dip toward a random depth at random long intervals,
    // hold briefly, then ease back to full. `target` is eased into `bright`.
    const gap = () => FADE_GAP_MIN + Math.random() * (FADE_GAP_MAX - FADE_GAP_MIN);
    let bright = 1.0;
    let target = 1.0;
    let lastFrame = start;
    let nextDip = gap(); // seconds (relative to start) until the next dip begins
    let returnAt = 0; // seconds at which to ease back to full (0 = not dipping)

    const onMove = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = 1 - e.clientY / window.innerHeight; // flip: vUv.y is 0 at the bottom
      const dx = x - last.x;
      const dy = y - last.y;
      if (last.x >= 0 && dx * dx + dy * dy < ADD_MIN_DIST * ADD_MIN_DIST) return;
      const i = head * 3;
      ripples[i] = x;
      ripples[i + 1] = y;
      ripples[i + 2] = (performance.now() - start) / 1000;
      head = (head + 1) % MAX_RIPPLES;
      last = { x, y };
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };
    window.addEventListener('resize', resize);
    resize();

    let raf = 0;
    let switched = false;
    const render = () => {
      raf = requestAnimationFrame(render);
      if (video.readyState < 2) return; // wait until frames are available
      resize();

      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

      const now = performance.now();
      const t = (now - start) / 1000;
      const dt = Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;

      // Advance the fade state machine, then ease toward the current target.
      if (returnAt === 0 && t >= nextDip) {
        target = FADE_DEPTH_MIN + Math.random() * (FADE_DEPTH_MAX - FADE_DEPTH_MIN);
        returnAt = t + FADE_HOLD;
      } else if (returnAt > 0 && t >= returnAt && target < 1.0) {
        target = 1.0;
      } else if (returnAt > 0 && target === 1.0 && bright > 0.99) {
        returnAt = 0;
        nextDip = t + gap();
      }
      bright += (target - bright) * (1 - Math.exp(-FADE_RATE * dt));

      gl.uniform1f(uTime, t);
      gl.uniform1f(uCanvasAspect, canvas.width / canvas.height);
      gl.uniform1f(uVideoAspect, (video.videoWidth || 16) / (video.videoHeight || 9));
      gl.uniform1f(uBrightness, bright);
      gl.uniform3fv(uRipples, ripples);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (!switched) {
        switched = true;
        setMode('shader');
      }
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
    };
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        className={`${className ?? ''} ${mode === 'shader' ? 'opacity-0' : ''}`}
        src={src}
      />
      <canvas ref={canvasRef} className={`${className ?? ''} ${mode === 'shader' ? '' : 'opacity-0'}`} />
    </>
  );
}
