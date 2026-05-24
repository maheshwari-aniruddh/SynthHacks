import { useRef, useCallback, useMemo } from "react";
import { motion, useSpring, useMotionValue, MotionValue } from "motion/react";

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

/** Panel receives its spring values as props — no hooks called inside */
function Panel({
  index,
  total,
  waveY,
  scaleY,
}: {
  index: number;
  total: number;
  waveY: MotionValue<number>;
  scaleY: MotionValue<number>;
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
      style={{
        width: w,
        height: h,
        marginLeft: -w / 2,
        marginTop: -h / 2,
        translateZ: baseZ,
        y: waveY,
        scaleY,
        transformOrigin: "bottom center",
        opacity,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div
        style={{ position: "absolute", inset: 0, background: gradient, mixBlendMode: "multiply" }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.32) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          border: `1px solid rgba(255,255,255,${0.08 + t * 0.22})`,
          boxSizing: "border-box",
        }}
      />
    </motion.div>
  );
}

/**
 * PanelSprings — a dedicated component that calls exactly PANEL_COUNT pairs of
 * useSpring hooks unconditionally at the top level, then passes the values to Panel.
 * This keeps hooks out of any loop.
 */
function PanelSprings({
  rotY,
  rotX,
  getTargets,
}: {
  rotY: MotionValue<number>;
  rotX: MotionValue<number>;
  getTargets: React.MutableRefObject<{
    waveY: number[];
    scaleY: number[];
  }>;
}) {
  // --- All 22 pairs of springs called unconditionally at the top level ---
  const wY0 = useSpring(0, WAVE_SPRING);  const sY0 = useSpring(1, WAVE_SPRING);
  const wY1 = useSpring(0, WAVE_SPRING);  const sY1 = useSpring(1, WAVE_SPRING);
  const wY2 = useSpring(0, WAVE_SPRING);  const sY2 = useSpring(1, WAVE_SPRING);
  const wY3 = useSpring(0, WAVE_SPRING);  const sY3 = useSpring(1, WAVE_SPRING);
  const wY4 = useSpring(0, WAVE_SPRING);  const sY4 = useSpring(1, WAVE_SPRING);
  const wY5 = useSpring(0, WAVE_SPRING);  const sY5 = useSpring(1, WAVE_SPRING);
  const wY6 = useSpring(0, WAVE_SPRING);  const sY6 = useSpring(1, WAVE_SPRING);
  const wY7 = useSpring(0, WAVE_SPRING);  const sY7 = useSpring(1, WAVE_SPRING);
  const wY8 = useSpring(0, WAVE_SPRING);  const sY8 = useSpring(1, WAVE_SPRING);
  const wY9 = useSpring(0, WAVE_SPRING);  const sY9 = useSpring(1, WAVE_SPRING);
  const wY10 = useSpring(0, WAVE_SPRING); const sY10 = useSpring(1, WAVE_SPRING);
  const wY11 = useSpring(0, WAVE_SPRING); const sY11 = useSpring(1, WAVE_SPRING);
  const wY12 = useSpring(0, WAVE_SPRING); const sY12 = useSpring(1, WAVE_SPRING);
  const wY13 = useSpring(0, WAVE_SPRING); const sY13 = useSpring(1, WAVE_SPRING);
  const wY14 = useSpring(0, WAVE_SPRING); const sY14 = useSpring(1, WAVE_SPRING);
  const wY15 = useSpring(0, WAVE_SPRING); const sY15 = useSpring(1, WAVE_SPRING);
  const wY16 = useSpring(0, WAVE_SPRING); const sY16 = useSpring(1, WAVE_SPRING);
  const wY17 = useSpring(0, WAVE_SPRING); const sY17 = useSpring(1, WAVE_SPRING);
  const wY18 = useSpring(0, WAVE_SPRING); const sY18 = useSpring(1, WAVE_SPRING);
  const wY19 = useSpring(0, WAVE_SPRING); const sY19 = useSpring(1, WAVE_SPRING);
  const wY20 = useSpring(0, WAVE_SPRING); const sY20 = useSpring(1, WAVE_SPRING);
  const wY21 = useSpring(0, WAVE_SPRING); const sY21 = useSpring(1, WAVE_SPRING);

  const waveYSprings = useMemo(
    () => [wY0,wY1,wY2,wY3,wY4,wY5,wY6,wY7,wY8,wY9,wY10,wY11,wY12,wY13,wY14,wY15,wY16,wY17,wY18,wY19,wY20,wY21],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const scaleYSprings = useMemo(
    () => [sY0,sY1,sY2,sY3,sY4,sY5,sY6,sY7,sY8,sY9,sY10,sY11,sY12,sY13,sY14,sY15,sY16,sY17,sY18,sY19,sY20,sY21],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Attach setter functions to the ref so the parent can update springs
  const setWave = useCallback((targets: number[]) => {
    targets.forEach((v, i) => waveYSprings[i]?.set(v));
  }, [waveYSprings]);
  const setScale = useCallback((targets: number[]) => {
    targets.forEach((v, i) => scaleYSprings[i]?.set(v));
  }, [scaleYSprings]);

  // Expose setters in parent ref (runs synchronously on every render — stable because callbacks are memoized)
  (getTargets as React.MutableRefObject<{
    waveY: number[];
    scaleY: number[];
    setWave: (t: number[]) => void;
    setScale: (t: number[]) => void;
  }>).current.setWave = setWave;
  (getTargets as React.MutableRefObject<{
    waveY: number[];
    scaleY: number[];
    setWave: (t: number[]) => void;
    setScale: (t: number[]) => void;
  }>).current.setScale = setScale;

  return (
    <motion.div
      style={{ rotateY: rotY, rotateX: rotX, transformStyle: "preserve-3d", position: "relative", width: 0, height: 0 }}
    >
      {waveYSprings.map((waveY, i) => (
        <Panel key={i} index={i} total={PANEL_COUNT} waveY={waveY} scaleY={scaleYSprings[i]} />
      ))}
    </motion.div>
  );
}

export default function StackedPanels() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rotY = useSpring(-42, SCENE_SPRING);
  const rotX = useSpring(18, SCENE_SPRING);

  const springsRef = useRef<{
    waveY: number[];
    scaleY: number[];
    setWave: (t: number[]) => void;
    setScale: (t: number[]) => void;
  }>({ waveY: [], scaleY: [], setWave: () => {}, setScale: () => {} });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top) / rect.height;
    rotY.set(-42 + (cx - 0.5) * 14);
    rotX.set(18 + (cy - 0.5) * -10);
    const cursorCardPos = cx * (PANEL_COUNT - 1);
    const waveTargets = Array.from({ length: PANEL_COUNT }, (_, i) => {
      const dist = Math.abs(i - cursorCardPos);
      return -Math.exp(-(dist * dist) / (2 * SIGMA * SIGMA)) * 70;
    });
    const scaleTargets = Array.from({ length: PANEL_COUNT }, (_, i) => {
      const dist = Math.abs(i - cursorCardPos);
      return 0.35 + Math.exp(-(dist * dist) / (2 * SIGMA * SIGMA)) * 0.65;
    });
    springsRef.current.setWave(waveTargets);
    springsRef.current.setScale(scaleTargets);
  }, [rotY, rotX]);

  const handleMouseLeave = useCallback(() => {
    rotY.set(-42);
    rotX.set(18);
    springsRef.current.setWave(Array(PANEL_COUNT).fill(0));
    springsRef.current.setScale(Array(PANEL_COUNT).fill(1));
  }, [rotY, rotX]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative w-full h-full flex items-center justify-center select-none"
      style={{ perspective: "900px" }}
    >
      <PanelSprings rotY={rotY} rotX={rotX} getTargets={springsRef as React.MutableRefObject<{waveY: number[]; scaleY: number[]; setWave: (t: number[]) => void; setScale: (t: number[]) => void;}>} />
    </div>
  );
}
