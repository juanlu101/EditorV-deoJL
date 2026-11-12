// Croma (fondo verde) con WebGL
let gl, canvas, prog, tex, uLoc = {};
const VS = `attribute vec2 p; varying vec2 uv; void main(){ uv = vec2((p.x+1.)/2., 1.-(p.y+1.)/2.); gl_Position = vec4(p,0.,1.); }`;
const FS = `precision mediump float; varying vec2 uv; uniform sampler2D img; uniform vec3 key; uniform float sim, smooth_, spill;
vec2 rgb2uv(vec3 c){ return vec2(c.r*-0.169 + c.g*-0.331 + c.b*0.5 + 0.5, c.r*0.5 + c.g*-0.419 + c.b*-0.081 + 0.5); }
void main(){
  vec4 c = texture2D(img, uv);
  float d = distance(rgb2uv(c.rgb), rgb2uv(key));
  float base = d - sim;
  float a = pow(clamp(base / max(smooth_,0.001), 0., 1.), 1.5);
  float sp = pow(clamp(base / max(spill,0.001), 0., 1.), 1.5);
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 col = mix(vec3(lum), c.rgb, sp);
  gl_FragColor = vec4(col * a * c.a, a * c.a);
}`;

function init() {
  canvas = document.createElement('canvas');
  gl = canvas.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return false;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const n of ['key', 'sim', 'smooth_', 'spill']) uLoc[n] = gl.getUniformLocation(prog, n);
  return true;
}

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

// Devuelve un canvas con el croma aplicado (se reutiliza: dibújalo inmediatamente)
export function chromaKey(src, w, h, opt) {
  if (!gl && !init()) return src;
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  gl.viewport(0, 0, w, h);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch { return src; }
  gl.uniform3fv(uLoc.key, hex(opt.color));
  gl.uniform1f(uLoc.sim, opt.similarity * 0.5);
  gl.uniform1f(uLoc.smooth_, opt.smoothness * 0.5);
  gl.uniform1f(uLoc.spill, opt.spill * 0.5);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}
