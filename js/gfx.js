// Renderer, quality tiers, post-processing (bloom, GTAO, grade/vignette), sky dome + PMREM environment, shadows.
import * as THREE from 'three';
import { EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, GTAOPass } from 'three/addons';

export const Q_LEVELS = ['auto', 'low', 'med', 'high'];
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vig: { value: 0.9 }, sat: { value: 1.08 }, grain: { value: 0.025 }, time: { value: 0 }, tint: { value: new THREE.Color(1, 1, 1) }, lift: { value: new THREE.Color(0, 0, 0) }, contrast: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float vig,sat,grain,time,contrast;uniform vec3 tint,lift;varying vec2 vUv;
    void main(){vec4 c=texture2D(tDiffuse,vUv);vec3 col=c.rgb;float l=dot(col,vec3(.2126,.7152,.0722));col=mix(vec3(l),col,sat);
    col=(col-.5)*contrast+.5;col=col*tint+lift*(1.-col);vec2 d=vUv-.5;col*=1.-vig*dot(d,d)*1.6;
    col+=(fract(sin(dot(vUv*(time+1.),vec2(12.9898,78.233)))*43758.5453)-.5)*grain;gl_FragColor=vec4(max(col,0.),c.a);}`,
};

export function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, sunSize: { value: 0.02 }, stars: { value: 0 }, clouds: { value: 0 }, cloudCol: { value: new THREE.Color() }, t: { value: 0 }, moon: { value: 0 } },
    vertexShader: 'varying vec3 vDir;void main(){vDir=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
    fragmentShader: `uniform vec3 top,hor,bot,sunDir,sunCol,cloudCol;uniform float sunSize,stars,clouds,t,moon;varying vec3 vDir;
      float h(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5453),b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5453),c=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5453),d=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5453);return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
      float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n2(p);p*=2.03;a*=.5;}return v;}
      void main(){vec3 d=normalize(vDir);float y=d.y;
        vec3 col=y>0.?mix(hor,top,pow(clamp(y,0.,1.),.55)):mix(hor,bot,pow(clamp(-y,0.,1.),.4));
        float sd=max(dot(d,normalize(sunDir)),0.);
        col+=sunCol*(pow(sd,8.)*.35+pow(sd,90.)*.8);
        if(moon>0.) col+=sunCol*smoothstep(1.-sunSize,1.-sunSize*.85,sd)*moon*3.; else col+=sunCol*smoothstep(1.-sunSize,1.-sunSize*.6,sd)*4.;
        if(stars>0.&&y>0.){vec3 q=floor(d*260.);float s=step(.9975,h(q));col+=vec3(s*stars*(.6+.4*sin(t*3.+h(q+1.)*30.)))*smoothstep(0.,.3,y);}
        if(clouds>0.&&y>-.05){vec2 uv=d.xz/(y+.18)*1.6+vec2(t*.01,t*.004);float c=smoothstep(.45,.85,fbm(uv));col=mix(col,cloudCol*(.7+.5*fbm(uv*2.+3.)),c*clouds*smoothstep(-.05,.25,y));}
        gl_FragColor=vec4(col,1.);}`,
  });
}

export class Gfx {
  constructor(canvas, isTouch) {
    this.isTouch = isTouch;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance', stencil: false });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envRT = null;
    let saved = 'auto'; try { saved = localStorage.getItem('db_q') || 'auto'; } catch (_) {}
    this.setting = Q_LEVELS.includes(saved) ? saved : 'auto';
    this.level = this.setting === 'auto' ? (isTouch ? 'med' : 'high') : this.setting;
    this.prScale = 1; this.composer = null; this.scene = null; this.camera = null;
    this.bloomStrength = 0.6;
  }
  attach(scene, camera, sun) { this.scene = scene; this.camera = camera; this.sun = sun; this.apply(); }
  setSetting(s) { this.setting = s; try { localStorage.setItem('db_q', s); } catch (_) {} this.level = s === 'auto' ? (this.isTouch ? 'med' : 'high') : s; this.prScale = 1; this.apply(); }
  downgrade() { // auto quality: called when fps is low
    if (this.setting !== 'auto') { if (this.prScale > 0.7) { this.prScale -= 0.15; this.resize(); return true; } return false; }
    if (this.level === 'high') { this.level = 'med'; this.apply(); return true; }
    if (this.level === 'med') { this.level = 'low'; this.apply(); return true; }
    if (this.prScale > 0.6) { this.prScale -= 0.15; this.resize(); return true; }
    return false;
  }
  pixelRatio() { const base = Math.min(devicePixelRatio || 1, this.level === 'high' ? 2 : this.level === 'med' ? (this.isTouch ? 1.5 : 1.5) : (this.isTouch ? 1 : 1.25)); return Math.max(0.5, base * this.prScale); }
  apply() {
    const L = this.level, s = this.sun;
    if (s) {
      s.castShadow = L !== 'low';
      const size = L === 'high' ? 2048 : 1024;
      if (s.shadow.mapSize.x !== size) { s.shadow.mapSize.set(size, size); if (s.shadow.map) { s.shadow.map.dispose(); s.shadow.map = null; } }
      this.renderer.shadowMap.type = L === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    if (L !== 'low' && this.scene) {
      const w = innerWidth, h = innerHeight;
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.isTouch ? 0 : 4 });
      const c = new EffectComposer(this.renderer, rt);
      c.addPass(new RenderPass(this.scene, this.camera));
      if (L === 'high') { const ao = new GTAOPass(this.scene, this.camera, w, h); ao.blendIntensity = 0.85; ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: 12 }); this.ao = ao; c.addPass(ao); } else this.ao = null;
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), this.bloomStrength, 0.4, 1.0); c.addPass(this.bloom);
      c.addPass(new OutputPass());
      this.grade = new ShaderPass(GradeShader); c.addPass(this.grade);
      this.composer = c;
    } else { this.bloom = null; this.grade = null; this.ao = null; }
    document.body.dataset.q = L;
    this.resize();
  }
  setLook(a) { // per-arena grading
    this.bloomStrength = a.bloom ?? 0.6; if (this.bloom) this.bloom.strength = this.bloomStrength;
    this.renderer.toneMappingExposure = a.exposure ?? 1;
    const g = a.grade || {};
    if (this.grade) { const u = this.grade.uniforms; u.tint.value.set(g.tint ?? 0xffffff); u.lift.value.set(g.lift ?? 0x000000); u.sat.value = g.sat ?? 1.08; u.contrast.value = g.contrast ?? 1.06; u.vig.value = g.vig ?? 0.9; }
    this._look = a;
  }
  resize() {
    const w = innerWidth, h = innerHeight, pr = this.pixelRatio();
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
    if (this.camera) { this.camera.aspect = w / h; this.camera.fov = w < h ? 72 : 58; this.camera.updateProjectionMatrix(); }
    if (this._look) this.setLook(this._look);
  }
  // Image-based lighting from a small procedural sky scene (one PMREM per arena)
  buildEnv(sky) {
    const s = new THREE.Scene(), m = skyMaterial();
    copySky(m, sky); m.uniforms.stars.value = 0; m.uniforms.clouds.value = 0;
    m.side = THREE.BackSide; const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), m); s.add(dome);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(s, 0.04, 0.1, 100);
    dome.geometry.dispose(); m.dispose();
    return this.envRT.texture;
  }
  render(t) {
    if (this.composer) { if (this.grade) this.grade.uniforms.time.value = t % 10; this.composer.render(); }
    else this.renderer.render(this.scene, this.camera);
  }
}
export function copySky(m, sky) {
  const u = m.uniforms; u.top.value.set(sky.top); u.hor.value.set(sky.hor); u.bot.value.set(sky.bot ?? sky.hor);
  u.sunDir.value.set(...(sky.sun || [0.3, 0.5, -0.8])).normalize(); u.sunCol.value.set(sky.sunCol ?? 0xffffff); u.sunSize.value = sky.sunSize ?? 0.02;
  u.stars.value = sky.stars ?? 0; u.clouds.value = sky.clouds ?? 0; u.cloudCol.value.set(sky.cloudCol ?? 0x888888); u.moon.value = sky.moon ? 1 : 0;
}
