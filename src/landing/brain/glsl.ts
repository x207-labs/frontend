// FE-044: shader code of the hero brain. The cortex is a sphere bent on the GPU: an ellipsoid with a flat base, temporal lobes, a deep cleft between the
// hemispheres and a lateral groove, covered with folds (gyri) cut by noise. Nothing is downloaded: no model file, no texture. FE-048 draws it as a hologram.

// 3D simplex noise: Ian McEwan, Ashima Arts, and Stefan Gustavson (webgl-noise, MIT license).
export const SIMPLEX = /* glsl */ `
vec3 bMod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 bMod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 bPermute(vec4 x) { return bMod289(((x * 34.0) + 1.0) * x); }
vec4 bTaylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float bNoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = bMod289(i);
  vec4 p = bPermute(bPermute(bPermute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = bTaylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`

// Cortex: n is the unit direction of the sphere vertex (x left-right, y up, z to the front). fold is 0 deep in a sulcus and 1 on the crown of a gyrus.
export const CORTEX = /* glsl */ `
float bCleft(vec3 n) { return exp(-pow(n.x / 0.055, 2.0)) * smoothstep(-0.5, 0.0, n.y); }
float bSylvian(vec3 n) {
  float line = n.y - (-0.1 + 0.34 * n.z);
  return exp(-pow(line / 0.06, 2.0)) * smoothstep(0.5, 0.82, abs(n.x)) * smoothstep(-0.5, -0.1, n.z) * (1.0 - smoothstep(0.3, 0.6, n.z));
}
float bGyri(vec3 n) {
  // Folds run mostly front to back on the cortex, so the noise is stretched along z; a domain warp makes them meander.
  vec3 w = n * 1.7 + vec3(2.07);
  vec3 q = n * vec3(4.6, 4.6, 3.5) + 0.6 * vec3(bNoise(w), bNoise(w + 5.2), bNoise(w + 11.7));
  float a = abs(bNoise(q));
  float b = abs(bNoise(q * 2.0 + 3.3));
  // The sulci are the zero lines of the noise: steep narrow walls (the square root), then a rounded crown.
  float s1 = sqrt(smoothstep(0.0, 0.3, a));
  float s2 = sqrt(smoothstep(0.0, 0.22, b));
  return s1 * mix(1.0, s2, 0.18);
}
vec3 bShape(vec3 n, out float fold, out float cleft) {
  vec3 p = n * vec3(0.78, 0.68, 1.06);
  p.x *= 1.0 - 0.14 * smoothstep(0.1, 1.0, n.z);
  p.y += 0.07 * smoothstep(-0.2, 0.6, n.y) * smoothstep(-0.9, 0.2, n.z);
  p.y -= 0.45 * min(p.y + 0.22, 0.0);
  p.y -= 0.05 * smoothstep(0.3, 1.0, n.z) * smoothstep(0.0, -0.6, -n.y);
  float t = smoothstep(0.35, 0.85, abs(n.x)) * exp(-pow((n.z + 0.02) / 0.42, 2.0)) * (1.0 - smoothstep(-0.6, 0.2, n.y));
  p.y -= 0.1 * t;
  p.x += sign(n.x) * 0.03 * t;
  fold = bGyri(n);
  cleft = bCleft(n);
  float r = 1.0 + 0.05 * (fold - 1.0) - 0.17 * cleft - 0.07 * bSylvian(n);
  return p * r;
}
`

// Cerebellum: a flattened pair of lobes under the back of the cortex, with fine horizontal folds (folia).
export const CEREBELLUM = /* glsl */ `
vec3 bShape(vec3 n, out float fold, out float cleft) {
  vec3 p = n * vec3(0.5, 0.25, 0.32);
  cleft = exp(-pow(n.x / 0.14, 2.0)) * smoothstep(-0.2, 0.6, -n.z);
  fold = 0.5 + 0.5 * sin(n.y * 40.0 + n.z * 8.0 + bNoise(n * 2.4) * 1.6);
  return p * (1.0 + 0.04 * (fold - 1.0) - 0.1 * cleft);
}
`

// Bends the sphere in the vertex shader and finds the normal by finite differences, so the folds are lit as real relief.
export const VERTEX_NORMAL = /* glsl */ `
vec3 bN0 = normalize(position);
vec3 bTA = normalize(abs(bN0.y) < 0.99 ? cross(bN0, vec3(0.0, 1.0, 0.0)) : cross(bN0, vec3(1.0, 0.0, 0.0)));
vec3 bTB = cross(bN0, bTA);
float bF0; float bC0; float bF1; float bC1; float bF2; float bC2;
vec3 bP0 = bShape(bN0, bF0, bC0);
vec3 bP1 = bShape(normalize(bN0 + bTA * 0.0035), bF1, bC1);
vec3 bP2 = bShape(normalize(bN0 + bTB * 0.0035), bF2, bC2);
vec3 bNormal = normalize(cross(bP1 - bP0, bP2 - bP0));
if (dot(bNormal, bP0) < 0.0) bNormal = -bNormal;
vFold = bF0;
vCleft = bC0;
vec3 objectNormal = bNormal;
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif
`

// Pipelines: a faint tube with a bright pulse running along it. uv.x goes from the far end (0) to the brain (1) for a line in, the other way for a line out.
export const PIPE_VERTEX = /* glsl */ `
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 nv = normalize(normalMatrix * normal);
  vFacing = abs(dot(nv, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}
`

export const PIPE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uGrow;
uniform float uSpeed;
uniform float uOffset;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;
varying float vFacing;
void main() {
  float s = vUv.x;
  if (s > uGrow) discard;
  float head = fract(uTime * uSpeed + uOffset) * 1.3 - 0.15;
  float d = head - s;
  float pulse = (1.0 - smoothstep(0.0, 0.22, d)) * step(0.0, d);
  // FE-048: the growing tip glows, so a pipeline is seen being drawn as the page scrolls.
  float tip = (1.0 - smoothstep(0.0, 0.05, uGrow - s)) * step(uGrow, 0.995);
  float a = (0.22 + pulse * 0.78 + tip) * mix(0.5, 1.0, vFacing) * smoothstep(0.0, 0.1, s) * (1.0 - smoothstep(0.96, 1.0, s));
  gl_FragColor = vec4(uColor * (1.0 + pulse * 0.8 + tip * 1.5), a * uOpacity);
  #include <colorspace_fragment>
}
`

// FE-048: the hologram. The same bent sphere as the cortex, drawn as light: a fresnel rim, the sulci as glowing contour lines, scanlines in world height, a
// sweep that runs up the brain, a reveal front that builds it from the base on load, and now and then a one-frame glitch. Additive, so it never hides what is behind.
export const HOLO_VERTEX = /* glsl */ `
uniform float uTime;
varying float vFold;
varying float vCleft;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec3 vObj;
varying float vWorldY;
${SIMPLEX}
SHAPE
void main() {
  ${VERTEX_NORMAL}
  vec3 transformed = bP0;
  float burst = step(0.965, fract(sin(floor(uTime * 9.0) * 12.9898) * 43758.5453));
  transformed.x += burst * 0.035 * sin(transformed.y * 46.0 + uTime * 40.0);
  vObj = transformed;
  vec4 world = modelMatrix * vec4(transformed, 1.0);
  vWorldY = world.y;
  vec4 mv = viewMatrix * world;
  vNormalV = normalize(normalMatrix * objectNormal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

export const HOLO_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uBuild;
uniform float uPulse;
uniform float uOpacity;
uniform vec3 uColor;
uniform vec3 uColorDeep;
varying float vFold;
varying float vCleft;
varying vec3 vNormalV;
varying vec3 vViewDir;
varying vec3 vObj;
varying float vWorldY;
void main() {
  float h = vObj.y;
  float front = mix(-0.75, 0.95, uBuild);
  if (h > front) discard;
  float edge = 1.0 - smoothstep(0.0, 0.07, front - h);
  float facing = abs(dot(normalize(vNormalV), normalize(vViewDir)));
  float fres = pow(1.0 - facing, 2.4);
  float contour = 1.0 - smoothstep(0.02, 0.16, vFold);
  float lines = smoothstep(0.55, 1.0, 0.5 + 0.5 * sin(vWorldY * 150.0 - uTime * 2.2));
  float sweepAt = fract(uTime * 0.16) * 2.4 - 1.2;
  float sweep = exp(-pow((vWorldY - sweepAt) / 0.05, 2.0));
  float flicker = 0.93 + 0.07 * sin(uTime * 31.0) * sin(uTime * 7.3);
  float back = gl_FrontFacing ? 1.0 : 0.35;
  float a = (0.035 + fres * 0.9 + contour * 0.32 + lines * 0.07 + sweep * 0.45 + edge * 1.2 + uPulse * (0.25 + fres)) * flicker * back;
  a *= 1.0 - 0.75 * vCleft;
  vec3 col = mix(uColorDeep, uColor, clamp(fres * 1.2 + contour * 0.5 + edge, 0.0, 1.0)) * (1.0 + sweep * 0.8 + edge * 1.4 + uPulse * 0.6);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uOpacity);
  #include <colorspace_fragment>
}
`

// A cloud of points just above the cortex: the data the brain holds. On the dive at the end of the story they scatter outward.
export const DUST_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uScatter;
uniform float uSize;
varying float vAlpha;
${SIMPLEX}
SHAPE
void main() {
  vec3 n = normalize(position);
  float f; float c;
  vec3 p = bShape(n, f, c) * (1.04 + 0.03 * sin(uTime * 0.9 + n.x * 9.0 + n.y * 7.0));
  float j = bNoise(n * 3.1 + uTime * 0.05);
  p += n * uScatter * (1.2 + j * 1.6);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + 0.4 * f) / -mv.z;
  vAlpha = (0.35 + 0.65 * smoothstep(-0.3, 0.6, j)) * (1.0 - 0.8 * c);
  gl_Position = projectionMatrix * mv;
}
`

export const DUST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(uColor, a * a * vAlpha * uOpacity);
  #include <colorspace_fragment>
}
`

// The projector under the brain: a beam that widens upward and fades (uv.y is 0 at the emitter), with faint vertical streaks.
export const BEAM_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const BEAM_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float streak = 0.6 + 0.4 * sin(vUv.x * 120.0 + uTime * 0.7) * sin(vUv.x * 37.0 - uTime * 0.4);
  float a = pow(1.0 - vUv.y, 1.6) * 0.16 * streak;
  gl_FragColor = vec4(uColor, a * uOpacity);
  #include <colorspace_fragment>
}
`

// A flat ring on the floor of the projector: a dashed band that turns.
export const RING_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uDash;
uniform float uSpin;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float ang = atan(p.y, p.x) / 6.2831853 + 0.5;
  float band = smoothstep(0.93, 0.965, r) * (1.0 - smoothstep(0.975, 1.0, r));
  float dash = uDash > 0.0 ? step(0.5, fract(ang * uDash + uTime * uSpin)) : 1.0;
  float disc = (1.0 - smoothstep(0.0, 0.95, r)) * 0.14;
  gl_FragColor = vec4(uColor, (band * dash + disc) * uOpacity);
  #include <colorspace_fragment>
}
`
