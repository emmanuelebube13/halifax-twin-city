import { describe, expect, it, vi } from "vitest";
import { enableAsyncShaders } from "./asyncShaders";

const COMPLETION = 0x91b1;

/** A stand-in for WebGL: a program counts as compiled once `ready` holds it. */
function fakeGl(withExtension = true) {
  const ready = new Set<object>();
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    linked: [] as object[],
    getExtension: (name: string) => (withExtension && name === "KHR_parallel_shader_compile" ? { COMPLETION_STATUS_KHR: COMPLETION } : null),
    createShader: () => ({}),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    createProgram: () => ({}),
    attachShader: vi.fn(),
    bindAttribLocation: vi.fn(),
    linkProgram(p: object) {
      gl.linked.push(p);
    },
    getProgramParameter: (p: object, pname: number) => (pname === COMPLETION ? ready.has(p) : true),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
  };
  return { gl, finishAll: () => gl.linked.forEach((p) => ready.add(p)) };
}

function setup(withExtension = true) {
  const drawn: string[] = [];
  class Context {
    _gl: unknown;
    constructor(gl: unknown) {
      this._gl = gl;
    }
    draw(cmd: { name: string }) {
      drawn.push(cmd.name);
    }
  }
  const { gl, finishAll } = fakeGl(withExtension);
  const passes = { render: true };
  const scene = { context: new Context(gl), frameState: { passes } };
  const C = { Context } as never;
  const api = enableAsyncShaders(C, scene as never);
  const sp = { _vertexShaderText: "void main(){}", _fragmentShaderText: "void main(){}", _attributeLocations: { position: 0 } };
  const draw = (name: string, program: object = sp) => scene.context.draw({ name, _shaderProgram: program } as never);
  return { api, draw, drawn, passes, finishAll, gl, sp };
}

describe("background shader compiling", () => {
  it("returns null without the browser extension, leaving Cesium alone", () => {
    expect(setup(false).api).toBeNull();
  });

  it("skips a normal frame's draw until its shader is compiled, then draws", () => {
    const { api, draw, drawn, finishAll, gl } = setup();
    draw("a");
    expect(drawn).toEqual([]);
    expect(api!.pending()).toBe(1);
    expect(gl.bindAttribLocation).toHaveBeenCalledWith(expect.anything(), 0, "position");
    draw("b");
    expect(drawn).toEqual([]);
    finishAll();
    draw("c");
    expect(drawn).toEqual(["c"]);
    expect(api!.pending()).toBe(0);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  });

  it("never skips picking, so a click always gets an answer", () => {
    const { draw, drawn, passes } = setup();
    passes.render = false;
    draw("pick");
    expect(drawn).toEqual(["pick"]);
  });

  it("draws at once with shaders that are already compiled", () => {
    const { draw, drawn } = setup();
    draw("ready", { _program: {} });
    expect(drawn).toEqual(["ready"]);
  });

  it("prewarm compiles picking shaders in the background and resolves when they are ready", async () => {
    const { api, draw, drawn, passes, finishAll } = setup();
    passes.render = false;
    let done = false;
    const warmed = api!.prewarm(() => draw("throwaway pick"), 2000).then(() => (done = true));
    expect(drawn).toEqual([]);
    // prewarm copies do not keep frames coming
    expect(api!.pending()).toBe(0);
    await new Promise((r) => setTimeout(r, 40));
    expect(done).toBe(false);
    finishAll();
    await warmed;
    expect(done).toBe(true);
    draw("real pick");
    expect(drawn).toEqual(["real pick"]);
  });

  it("frees a copy whose object went away before drawing again, so frames stop", () => {
    const { api, draw, finishAll } = setup();
    draw("a");
    expect(api!.pending()).toBe(1);
    finishAll();
    expect(api!.pending()).toBe(0);
  });
});
