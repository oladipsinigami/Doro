"use client";

import React, { useEffect, useRef } from "react";

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_motion;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.y, u_res.x);
  uv.x -= 0.32;
  uv.y -= 0.22;
  float t = u_time * 0.18 * u_motion;

  vec3 col = vec3(0.012, 0.008, 0.024);

  vec2 grid = uv * 80.0;
  vec2 cell = floor(grid);
  vec2 gv = fract(grid) - 0.5;
  float h = hash(cell);
  float twinkle = 0.55 + 0.45 * sin(u_time * u_motion * 1.4 + h * 40.0);
  float star = smoothstep(0.972, 0.995, h) * smoothstep(0.22, 0.02, length(gv)) * twinkle;
  col += star * vec3(0.95, 0.9, 1.0);

  float r = length(uv);
  float ang = atan(uv.y, uv.x);
  float bend = 0.22 / max(r, 0.06);
  float spin = ang + t + bend;

  float disk = smoothstep(0.155, 0.2, r) * smoothstep(0.72, 0.46, r);
  float approach = 0.28 + 1.05 * pow(max(cos(ang - 0.6), 0.0), 1.5);
  float bands = 0.5 + 0.5 * sin(spin * 16.0 - r * 28.0);
  vec3 gold = vec3(1.0, 0.74, 0.36);
  vec3 violet = vec3(0.48, 0.2, 0.82);
  col += mix(violet, gold, bands) * disk * approach;

  float photon = exp(-pow((r - 0.188) * 55.0, 2.0));
  col += vec3(1.0, 0.9, 0.72) * photon * (0.4 + 0.6 * approach);

  float lens = exp(-pow((r - 0.16) * 8.0, 2.0));
  col += vec3(0.55, 0.32, 0.95) * lens * 0.22;

  col *= 1.0 - smoothstep(0.15, 0.105, r);

  vec2 q = gl_FragCoord.xy / u_res - 0.5;
  float vig = smoothstep(0.85, 0.2, length(q * vec2(1.2, 1.05)));
  col *= mix(0.28, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export default function VoidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uMotion = gl.getUniformLocation(program, "u_motion");

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let motion = motionQuery.matches ? 0 : 1;
    const onMotion = () => {
      motion = motionQuery.matches ? 0 : 1;
    };
    motionQuery.addEventListener("change", onMotion);

    let frame = 0;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.floor(window.innerWidth * dpr));
      const h = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = (now: number) => {
      resize();
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform1f(uMotion, motion);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (motion === 1) frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      motionQuery.removeEventListener("change", onMotion);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(7,6,11,0.78)_0%,rgba(7,6,11,0.28)_38%,transparent_62%),radial-gradient(ellipse_at_center,transparent_0%,rgba(6,4,12,0.35)_70%,rgba(4,2,8,0.78)_100%)]" />
    </div>
  );
}
