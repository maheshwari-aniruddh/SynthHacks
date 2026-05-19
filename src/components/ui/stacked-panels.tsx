import { useRef, useCallback } from "react";
import { motion, useSpring } from "motion/react";

const PANEL_COUNT = 22;
const WAVE_SPRING = { stiffness: 160, damping: 22, mass: 0.6 };
const SCENE_SPRING = { stiffness: 80, damping: 22, mass: 1 };
const Z_SPREAD = 42;
const SIGMA = 2.8;

const PANEL_IMAGES = [
  "https://images.unsplash.com/photo-1527613426441-4da17471b66d?w=400&q=80",
  "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&q=80",
  "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?w=400&q=80",
  "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&q=80",
  "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=400&q=80",
  "https://images.unsplash.com/photo-1551076805-e1869033e561?w=400&q=80",
  "https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=400&q=80",
  "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400&q=80",
  "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=400&q=80",
  "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=400&q=80",
  "https://images.unsplash.com/photo-1516549655169-df83a0774514?w=400&q=80",
  "https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=400&q=80",
  "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?w=400&q=80",
  "https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=400&q=80",
  "https://images.unsplash.com/photo-1581595219315-a187dd40c322?w=400&q=80",
  "https://images.unsplash.com/photo-1504439468489-c8920d796a29?w=400&q=80",
  "https://images.unsplash.com/photo-1530497610245-94d3c16cda28?w=400&q=80",
  "https://images.unsplash.com/photo-1666214280250-dc14e8f5f15a?w=400&q=80",
  "https://images.unsplash.com/photo-1585435557343-3b092031a831?w=400&q=80",
  "https://images.unsplash.com/photo-1460672985063-6764ac8b9c74?w=400&q=80",
  "https://images.unsplash.com/photo-1579165466741-7f35e4755183?w=400&q=80",
  "https://images.unsplash.com/photo-1535914254981-b5012eebbd15?w=400&q=80",
];

const GRADIENT_OVERLAYS = [
  "linear-gradient(135deg, rgba(210,10,46,0.40) 0%, rgba(210,10,46,0.30) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.40) 0%, rgba(210,10,46,0.30) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.35) 0%, rgba(210,10,46,0.45) 100%)",
  "linear-gradient(135deg, rgba(255,215,0,0.30) 0%, rgba(255,215,0,0.40) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.45) 0%, rgba(210,10,46,0.25) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.45) 0%, rgba(210,10,46,0.25) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.40) 0%, rgba(255,215,0,0.25) 100%)",
  "linear-gradient(135deg, rgba(255,215,0,0.35) 0%, rgba(210,10,46,0.35) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.38) 0%, rgba(255,248,241,0.20) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.38) 0%, rgba(255,243,214,0.20) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.42) 0%, rgba(210,10,46,0.42) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.42) 0%, rgba(210,10,46,0.42) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.45) 0%, rgba(255,215,0,0.28) 100%)",
  "linear-gradient(135deg, rgba(255,215,0,0.45) 0%, rgba(210,10,46,0.28) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.30) 0%, rgba(210,10,46,0.50) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.30) 0%, rgba(210,10,46,0.50) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.42) 0%, rgba(210,10,46,0.35) 100%)",
  "linear-gradient(135deg, rgba(255,215,0,0.40) 0%, rgba(255,215,0,0.32) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.38) 0%, rgba(210,10,46,0.38) 100%)",
  "linear-gradient(135deg, rgba(255,215,0,0.38) 0%, rgba(210,10,46,0.38) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.48) 0%, rgba(210,10,46,0.30) 100%)",
  "linear-gradient(135deg, rgba(210,10,46,0.48) 0%, rgba(210,10,46,0.30) 100%)",
];

function Panel({ index, total, waveY, scaleY }: {
  index: number; total: number;
  waveY: ReturnType<typeof useSpring>;
  scaleY: ReturnType<typeof useSpring>;
}) {
  const t = index / (total - 1);
  const baseZ = (index - (total - 1)) * Z_SPREAD;
  const w = 200 + t * 80;
  const h = 280 + t * 120;
  const opacity = 0.25 + t * 0.75;
  const imageUrl = PANEL_IMAGES[index % PANEL_IMAGES.length];
  const gradient = GRADIENT_OVERLAYS[index % GRADIENT_OVERLAYS.length];

  return (
    <motion.div
      className="absolute rounded-xl pointer-events-none overflow-hidden"
      style={{ width: w, height: h, marginLeft: -w/2, marginTop: -h/2,
        translateZ: baseZ, y: waveY, scaleY, transformOrigin: "bottom center", opacity }}
    >
      <div style={{ position:"absolute", inset:0, backgroundImage:`url(${imageUrl})`, backgroundSize:"cover", backgroundPosition:"center" }} />
      <div style={{ position:"absolute", inset:0, background:gradient, mixBlendMode:"multiply" }} />
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.32) 100%)" }} />
      <div style={{ position:"absolute", inset:0, borderRadius:"inherit", border:`1px solid rgba(255,255,255,${0.08+t*0.22})`, boxSizing:"border-box" }} />
    </motion.div>
  );
}

export default function StackedPanels() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isHovering = useRef(false);
  const waveYSprings = Array.from({ length: PANEL_COUNT }, () => useSpring(0, WAVE_SPRING));
  const scaleYSprings = Array.from({ length: PANEL_COUNT }, () => useSpring(1, WAVE_SPRING));
  const rotY = useSpring(-42, SCENE_SPRING);
  const rotX = useSpring(18, SCENE_SPRING);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    isHovering.current = true;
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    rotY.set(-42 + (cx - 0.5) * 14);
    rotX.set(18 + (cy - 0.5) * -10);
    const cursorCardPos = cx * (PANEL_COUNT - 1);
    waveYSprings.forEach((spring, i) => {
      const dist = Math.abs(i - cursorCardPos);
      spring.set(-Math.exp(-(dist*dist)/(2*SIGMA*SIGMA)) * 70);
    });
    scaleYSprings.forEach((spring, i) => {
      const dist = Math.abs(i - cursorCardPos);
      spring.set(0.35 + Math.exp(-(dist*dist)/(2*SIGMA*SIGMA)) * 0.65);
    });
  }, [rotY, rotX, waveYSprings, scaleYSprings]);

  const handleMouseLeave = useCallback(() => {
    isHovering.current = false;
    rotY.set(-42); rotX.set(18);
    waveYSprings.forEach(s => s.set(0));
    scaleYSprings.forEach(s => s.set(1));
  }, [rotY, rotX, waveYSprings, scaleYSprings]);

  return (
    <div ref={containerRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
      className="relative w-full h-full flex items-center justify-center select-none"
      style={{ perspective: "900px" }}>
      <motion.div style={{ rotateY: rotY, rotateX: rotX, transformStyle:"preserve-3d", position:"relative", width:0, height:0 }}>
        {Array.from({ length: PANEL_COUNT }).map((_, i) => (
          <Panel key={i} index={i} total={PANEL_COUNT} waveY={waveYSprings[i]} scaleY={scaleYSprings[i]} />
        ))}
      </motion.div>
    </div>
  );
}
