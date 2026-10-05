// Logo de Ricordo en 3D: extruido desde el mismo SVG del logo, luz cálida de cocina.
// Se carga aparte (chunk propio) y solo en equipos capaces; el logo 2D queda debajo como respaldo.
import {
  ACESFilmicToneMapping, Box3, Color, DirectionalLight, ExtrudeGeometry, Group, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PointLight, SRGBColorSpace, Scene, Vector3, WebGLRenderer, type Object3D,
} from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { WORDMARK_D } from '../assets/logo-paths';

export interface Logo3D {
  setPointer(x: number, y: number): void; // -1..1
  setProgress(p: number): void; // 0 = hero, 1 = se fue hacia el catálogo
  setTheme(dark: boolean): void;
  destroy(): void;
}

const GLB_URL = import.meta.env.VITE_LOGO_GLB as string | undefined; // opcional: modelo propio en /public

function cssColor(name: string, fallback: string): Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  try {
    return new Color(v || fallback);
  } catch {
    return new Color(fallback);
  }
}

async function buildModel(front: MeshStandardMaterial, side: MeshStandardMaterial): Promise<Object3D> {
  if (GLB_URL) {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().loadAsync(GLB_URL);
    return gltf.scene;
  }
  // evenodd, igual que el logo 2D: sin esto los huecos de la R, las "o" y la "d" salen rellenos.
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="${WORDMARK_D}"/></svg>`);
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  const geo = new ExtrudeGeometry(shapes, {
    depth: 90, bevelEnabled: true, bevelThickness: 14, bevelSize: 7, bevelSegments: 2, curveSegments: 5,
  });
  geo.scale(1, -1, 1); // SVG tiene el eje Y hacia abajo
  geo.computeVertexNormals();
  geo.center();
  return new Mesh(geo, [front, side]); // grupo 0 = caras, grupo 1 = laterales
}

export async function createLogo3D(canvas: HTMLCanvasElement, onReady: () => void): Promise<Logo3D> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 10, 20000);

  const front = new MeshStandardMaterial({ roughness: 0.55, metalness: 0.04 });
  const side = new MeshStandardMaterial({ roughness: 0.7, metalness: 0.02 });

  // Luz de cocina: ambiente cálido, ventana arriba a la izquierda y un rebote cálido abajo.
  const hemi = new HemisphereLight(0xfff0dc, 0x3a2418, 1.1);
  const key = new DirectionalLight(0xffd8a3, 2.4);
  key.position.set(-900, 1200, 1400);
  const rim = new DirectionalLight(0xffe9c9, 1.2);
  rim.position.set(1600, 300, -800);
  const bounce = new PointLight(0xff9a8a, 1.4, 0, 0);
  bounce.position.set(0, -900, 900);
  scene.add(hemi, key, rim, bounce);

  const pivot = new Group();
  scene.add(pivot);
  const model = await buildModel(front, side);
  pivot.add(model);

  // Encuadre: el ancho del logo entra justo en el canvas.
  const size = new Box3().setFromObject(model).getSize(new Vector3());
  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fitW = size.x * 1.24 / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const fitH = size.y * 1.4 / (2 * Math.tan((camera.fov * Math.PI) / 360));
    camera.position.set(0, 0, Math.max(fitW, fitH));
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  function setTheme(dark: boolean) {
    front.color = cssColor('--color-logo', dark ? '#F0675F' : '#DA3833');
    side.color = cssColor('--ricordo-rosso-hondo', '#A8231E').multiplyScalar(dark ? 0.9 : 0.8);
    hemi.intensity = dark ? 0.7 : 1.1;
  }
  setTheme(matchMedia('(prefers-color-scheme: dark)').matches);

  // Movimiento: rotación lenta + reacción suave al puntero/giroscopio + salida con el scroll.
  const target = { x: 0, y: 0 };
  const cur = { x: 0, y: 0 };
  let progress = 0;
  let running = true;
  let visible = true;
  let raf = 0;
  const t0 = performance.now();

  // 30 cuadros por segundo alcanzan para un vaivén lento y gastan la mitad de batería.
  let last = 0;
  function frame(now: number) {
    raf = 0;
    if (!running || !visible) return;
    if (now - last < 32) {
      raf = requestAnimationFrame(frame);
      return;
    }
    last = now;
    const t = (now - t0) / 1000;
    cur.x += (target.x - cur.x) * 0.06;
    cur.y += (target.y - cur.y) * 0.06;
    const sway = Math.sin(t * 0.35) * 0.22; // vaivén lento, nunca una vuelta entera
    pivot.rotation.y = sway + cur.x * 0.35 + progress * 0.9;
    pivot.rotation.x = Math.sin(t * 0.27) * 0.05 - cur.y * 0.18 + progress * 0.35;
    pivot.position.z = -progress * size.x * 1.6;
    pivot.position.y = progress * size.y * 0.8;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  const loop = () => { if (!raf && running && visible) raf = requestAnimationFrame(frame); };

  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; loop(); });
  io.observe(canvas);
  const onVis = () => { running = document.visibilityState === 'visible'; loop(); };
  document.addEventListener('visibilitychange', onVis);

  renderer.render(scene, camera);
  onReady();
  loop();

  return {
    setPointer(x, y) { target.x = Math.max(-1, Math.min(1, x)); target.y = Math.max(-1, Math.min(1, y)); },
    setProgress(p) { progress = Math.max(0, Math.min(1, p)); },
    setTheme,
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      model.traverse((o) => { const m = o as Mesh; m.geometry?.dispose(); });
      front.dispose();
      side.dispose();
      renderer.dispose();
    },
  };
}
