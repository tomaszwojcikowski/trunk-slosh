export type InkParams = {
	/** Camera offset in scene pixels, wrapped to the hatch period so world-anchored hatching stays precise */
	worldOffset: [number, number];
	/** Sobel sample distance in pixels (outline thickness) */
	inkWidth: number;
	/** Distance between hatch lines in pixels */
	hatchSpacing: number;
	time: number;
	enabled: boolean;
	/** 0 = no hatching, 1 = medium, 2 = full crosshatch */
	hatchLevel: number;
};

export interface Presenter {
	readonly kind: "webgl" | "2d";
	resize(width: number, height: number): void;
	present(scene: HTMLCanvasElement, params: InkParams): void;
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;
uniform sampler2D u_scene;
uniform vec2 u_texel;
uniform vec2 u_res;
uniform vec2 u_world;
uniform float u_ink;
uniform float u_hatch;
uniform float u_time;
uniform float u_mode;
uniform float u_hatchLevel;

const vec3 INK = vec3(0.07, 0.045, 0.03);

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// 1 on a hatch line, 0 between lines; t is the line coordinate in units of spacing
float lines(float t, float width) {
  float d = abs(fract(t) - 0.5);
  return smoothstep(0.5 - width - 0.08, 0.5 - width, d);
}

void main() {
  vec3 c = texture2D(u_scene, v_uv).rgb;
  if (u_mode < 0.5) {
    gl_FragColor = vec4(c, 1.0);
    return;
  }

  vec2 o = u_texel * u_ink;
  vec3 tl = texture2D(u_scene, v_uv + vec2(-o.x, -o.y)).rgb;
  vec3 tc = texture2D(u_scene, v_uv + vec2(0.0, -o.y)).rgb;
  vec3 tr = texture2D(u_scene, v_uv + vec2(o.x, -o.y)).rgb;
  vec3 ml = texture2D(u_scene, v_uv + vec2(-o.x, 0.0)).rgb;
  vec3 mr = texture2D(u_scene, v_uv + vec2(o.x, 0.0)).rgb;
  vec3 bl = texture2D(u_scene, v_uv + vec2(-o.x, o.y)).rgb;
  vec3 bc = texture2D(u_scene, v_uv + vec2(0.0, o.y)).rgb;
  vec3 br = texture2D(u_scene, v_uv + vec2(o.x, o.y)).rgb;
  vec3 gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  vec3 gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
  float edge = length(gx) + length(gy);
  float ink = smoothstep(1.3, 2.3, edge);

  // cel bands: quantize brightness, keep hue
  float L = luma(c);
  float bands = 5.0;
  float Lq = clamp((floor(L * bands) + 0.55) / bands, 0.0, 1.0);
  vec3 col = mix(c, c * (Lq / max(L, 0.02)), 0.75);
  float g = luma(col);
  col = mix(vec3(g), col, 1.2);

  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) + u_world;
  float s = u_hatch;
  float hatch = 0.0;
  if (u_hatchLevel > 0.5) {
    hatch = max(hatch, (1.0 - smoothstep(0.36, 0.41, L)) * lines((p.x + p.y) / s, 0.11));
  }
  if (u_hatchLevel > 1.5) {
    hatch = max(hatch, (1.0 - smoothstep(0.22, 0.30, L)) * lines((p.x - p.y) / s, 0.11));
    hatch = max(hatch, (1.0 - smoothstep(0.10, 0.16, L)) * lines(p.x / (s * 0.7), 0.13));
  }
  // Terrain shadows hatch toward ink. Deep tub green keeps its hue.
  float liquid = smoothstep(0.04, 0.16, c.g - max(c.r, c.b));
  vec3 hatched = mix(INK, col * 0.42, liquid);
  col = mix(col, hatched, hatch * 0.55);

  col = mix(col, INK, ink);

  // paper grain + warm vignette
  float grain = hash(floor(gl_FragCoord.xy / 1.5) + floor(u_time * 12.0));
  col *= 0.95 + 0.07 * grain;
  vec2 q = v_uv - 0.5;
  col *= 1.0 - dot(q, q) * 0.6;
  col = mix(col, col * vec3(1.04, 0.98, 0.9), 0.5);

  gl_FragColor = vec4(col, 1.0);
}`;

function compile(
	gl: WebGLRenderingContext,
	type: number,
	src: string,
): WebGLShader {
	const sh = gl.createShader(type);
	if (!sh) throw new Error("createShader failed");
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(sh);
		gl.deleteShader(sh);
		throw new Error(`shader compile failed: ${log}`);
	}
	return sh;
}

/** Full-screen WebGL pass that turns the flat 2D scene into an inked, cel-shaded comic frame. */
export class InkPost implements Presenter {
	readonly kind = "webgl" as const;
	private readonly gl: WebGLRenderingContext;
	private readonly canvas: HTMLCanvasElement;
	private program!: WebGLProgram;
	private texture!: WebGLTexture;
	private uniforms!: Record<string, WebGLUniformLocation | null>;
	private lost = false;

	constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext) {
		this.canvas = canvas;
		this.gl = gl;
		this.init();
		canvas.addEventListener("webglcontextlost", (e) => {
			e.preventDefault();
			this.lost = true;
		});
		canvas.addEventListener("webglcontextrestored", () => {
			this.init();
			this.lost = false;
		});
	}

	private init() {
		const gl = this.gl;
		const program = gl.createProgram();
		if (!program) throw new Error("createProgram failed");
		gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
		gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
		gl.bindAttribLocation(program, 0, "a_pos");
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
		}
		this.program = program;

		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
			gl.STATIC_DRAW,
		);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

		const tex = gl.createTexture();
		if (!tex) throw new Error("createTexture failed");
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.texture = tex;

		gl.useProgram(program);
		this.uniforms = {};
		for (const name of [
			"u_scene",
			"u_texel",
			"u_res",
			"u_world",
			"u_ink",
			"u_hatch",
			"u_time",
			"u_mode",
			"u_hatchLevel",
		]) {
			this.uniforms[name] = gl.getUniformLocation(program, name);
		}
		gl.uniform1i(this.uniforms.u_scene, 0);
	}

	resize(width: number, height: number) {
		this.canvas.width = width;
		this.canvas.height = height;
	}

	present(scene: HTMLCanvasElement, p: InkParams) {
		if (this.lost) return;
		const gl = this.gl;
		const w = this.canvas.width;
		const h = this.canvas.height;
		gl.viewport(0, 0, w, h);
		gl.useProgram(this.program);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
		const u = this.uniforms;
		gl.uniform2f(u.u_texel, 1 / scene.width, 1 / scene.height);
		gl.uniform2f(u.u_res, w, h);
		gl.uniform2f(u.u_world, p.worldOffset[0], p.worldOffset[1]);
		gl.uniform1f(u.u_ink, p.inkWidth);
		gl.uniform1f(u.u_hatch, p.hatchSpacing);
		gl.uniform1f(u.u_time, p.time);
		gl.uniform1f(u.u_mode, p.enabled ? 1 : 0);
		gl.uniform1f(u.u_hatchLevel, p.hatchLevel ?? 2);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}
}

export class Plain2DPresenter implements Presenter {
	readonly kind = "2d" as const;
	private readonly canvas: HTMLCanvasElement;
	private readonly ctx: CanvasRenderingContext2D;

	constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
		this.canvas = canvas;
		this.ctx = ctx;
	}

	resize(width: number, height: number) {
		this.canvas.width = width;
		this.canvas.height = height;
	}

	present(scene: HTMLCanvasElement, _params?: InkParams) {
		this.ctx.drawImage(scene, 0, 0, this.canvas.width, this.canvas.height);
	}
}

export function createPresenter(canvas: HTMLCanvasElement): Presenter {
	let target = canvas;
	const gl = canvas.getContext("webgl", {
		antialias: false,
		alpha: false,
		preserveDrawingBuffer: false,
	});
	if (gl) {
		try {
			return new InkPost(canvas, gl);
		} catch (err) {
			console.warn("Ink shader unavailable, using flat 2D output", err);
			// A canvas bound to WebGL can never hand out a 2D context, so swap in a fresh one.
			target = canvas.cloneNode(false) as HTMLCanvasElement;
			canvas.replaceWith(target);
		}
	}
	const ctx = target.getContext("2d");
	if (!ctx) throw new Error("No canvas rendering context available");
	return new Plain2DPresenter(target, ctx);
}
