// Speed: compile Cesium's shaders in the background instead of freezing the page.
//
// Cesium compiles a shader the first time it draws with it, then asks WebGL straight away whether linking
// worked. That question makes the page wait for the graphics driver, which on Windows (Direct3D through ANGLE)
// took 1.7 s in total when 3D first opened, in chunks of about 0.6 s.
//
// Browsers can compile in the background (WebGL extension KHR_parallel_shader_compile), but Cesium does not use
// it. So, during normal drawing only, the first time Cesium is about to draw with a shader that is not compiled
// yet, we compile an identical copy ourselves without waiting, and skip that one draw. Once the copy is done, we
// let Cesium compile its own; the browser keeps compiled shaders in a cache keyed by their source, so that is
// now almost instant. Things appear a frame or two later, which is invisible while the tiles stream in anyway.
//
// Picking and height sampling still compile on the spot, so a click or a height never comes back empty. To keep
// those off the user's first click too, prewarm() runs a throwaway pick or height sample in which every missing
// shader is started in the background instead (its answer is meaningless and thrown away).
// Without the extension, or if anything here fails, Cesium behaves exactly as before.

import type * as CesiumNS from "cesium";

type GL = WebGL2RenderingContext | WebGLRenderingContext;

interface CesiumShaderProgram {
  _program?: WebGLProgram;
  _vertexShaderText?: string;
  _fragmentShaderText?: string;
  _attributeLocations?: Record<string, number>;
}

interface Warming {
  program: WebGLProgram;
  shaders: WebGLShader[];
  /** Counted in `pending`: started by a normal frame, which keeps frames coming until it is ready. */
  counted: boolean;
}

interface ContextState {
  gl: GL;
  completionStatus: number;
  isRenderPass: () => boolean;
  warm: WeakMap<CesiumShaderProgram, Warming | "done">;
  pending: number;
  /** True during prewarm(): every pass compiles in the background and skips its draws. */
  warmOnly: boolean;
  /** Every copy still compiling. Swept on each check, so one whose object went away before it was drawn
   * again is still freed and never keeps frames coming. */
  background: Map<CesiumShaderProgram, Warming>;
}

type DrawFn = (drawCommand: { _shaderProgram?: CesiumShaderProgram }, passState?: unknown, shaderProgram?: CesiumShaderProgram, uniformMap?: unknown) => void;

const states = new WeakMap<object, ContextState>();
const patchedPrototypes = new WeakSet<object>();

export interface AsyncShaders {
  /** Shaders still compiling in the background; while above 0, keep asking for frames. */
  pending: () => number;
  /**
   * Runs fn (a throwaway scene.pick or sampleHeight) with every missing shader compiled in the background, and
   * resolves when those shaders are ready, or after timeoutMs. Whatever fn returns is meaningless.
   */
  prewarm: (fn: () => void, timeoutMs?: number) => Promise<void>;
}

/** Turns on background shader compiling for this scene. Returns null when the browser cannot do it. */
export function enableAsyncShaders(C: typeof CesiumNS, scene: CesiumNS.Scene): AsyncShaders | null {
  try {
    const context = (scene as unknown as { context?: { _gl?: GL } }).context;
    const gl = context?._gl;
    const ContextClass = (C as unknown as { Context?: { prototype: { draw: DrawFn } } }).Context;
    if (!context || !gl || !ContextClass?.prototype?.draw) return null;
    const ext = gl.getExtension("KHR_parallel_shader_compile") as { COMPLETION_STATUS_KHR: number } | null;
    if (!ext) return null;
    const frameState = (scene as unknown as { frameState?: { passes?: { render?: boolean } } }).frameState;
    const state: ContextState = {
      gl,
      completionStatus: ext.COMPLETION_STATUS_KHR,
      isRenderPass: () => Boolean(frameState?.passes?.render),
      warm: new WeakMap(),
      pending: 0,
      warmOnly: false,
      background: new Map(),
    };
    states.set(context, state);
    if (!patchedPrototypes.has(ContextClass.prototype)) {
      patchedPrototypes.add(ContextClass.prototype);
      const original = ContextClass.prototype.draw;
      ContextClass.prototype.draw = function (this: object, drawCommand, passState, shaderProgram, uniformMap) {
        const st = states.get(this);
        const sp = shaderProgram ?? drawCommand?._shaderProgram;
        if (st && sp && !sp._program && (st.warmOnly || st.isRenderPass()) && shouldSkip(st, sp)) return;
        original.call(this, drawCommand, passState, shaderProgram, uniformMap);
      };
    }
    const pending = () => {
      for (const [sp, w] of [...state.background]) finishIfReady(state, sp, w);
      return state.pending;
    };
    return { pending, prewarm: (fn, timeoutMs = 3000) => prewarm(state, fn, timeoutMs) };
  } catch {
    return null;
  }
}

/** True while the shader's background copy is still compiling, so this draw should wait. */
function shouldSkip(st: ContextState, sp: CesiumShaderProgram): boolean {
  const w = st.warm.get(sp);
  if (w === "done") return false;
  const { gl } = st;
  if (!w) {
    const vsText = sp._vertexShaderText;
    const fsText = sp._fragmentShaderText;
    if (typeof vsText !== "string" || typeof fsText !== "string") {
      st.warm.set(sp, "done");
      return false;
    }
    try {
      const vs = gl.createShader(gl.VERTEX_SHADER)!;
      gl.shaderSource(vs, vsText);
      gl.compileShader(vs);
      const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(fs, fsText);
      gl.compileShader(fs);
      const program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      // the same attribute bindings as Cesium's own link, so the browser's cache sees the same program
      for (const [name, loc] of Object.entries(sp._attributeLocations ?? {})) gl.bindAttribLocation(program, loc, name);
      gl.linkProgram(program);
      const counted = !st.warmOnly;
      st.warm.set(sp, { program, shaders: [vs, fs], counted });
      if (counted) st.pending++;
      st.background.set(sp, st.warm.get(sp) as Warming);
      return true;
    } catch {
      st.warm.set(sp, "done");
      return false;
    }
  }
  return !finishIfReady(st, sp, w);
}

/** Frees the background copy once the driver has finished it. Asking never waits. */
function finishIfReady(st: ContextState, sp: CesiumShaderProgram, w: Warming): boolean {
  const { gl } = st;
  if (!gl.getProgramParameter(w.program, st.completionStatus)) return false;
  for (const s of w.shaders) gl.deleteShader(s);
  gl.deleteProgram(w.program);
  st.warm.set(sp, "done");
  st.background.delete(sp);
  if (w.counted) st.pending--;
  return true;
}

function prewarm(st: ContextState, fn: () => void, timeoutMs: number): Promise<void> {
  st.warmOnly = true;
  try {
    fn();
  } catch {
    // a throwaway pass; nothing to report
  } finally {
    st.warmOnly = false;
  }
  const started = performance.now();
  return new Promise((resolve) => {
    const poll = () => {
      for (const [sp, w] of [...st.background]) finishIfReady(st, sp, w);
      if ([...st.background.values()].every((w) => w.counted) || performance.now() - started > timeoutMs) resolve();
      else setTimeout(poll, 30);
    };
    poll();
  });
}
