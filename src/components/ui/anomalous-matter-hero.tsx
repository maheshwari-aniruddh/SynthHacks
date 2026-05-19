"use client";

import React, { useRef, useEffect, Suspense } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

export function GenerativeArtScene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      currentMount.clientWidth / currentMount.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 3;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    currentMount.appendChild(renderer.domElement);

    const geometry = new THREE.IcosahedronGeometry(1.2, 64);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        pointLightPos: { value: new THREE.Vector3(0, 0, 5) },
        color: { value: new THREE.Color("#38bdf8") },
        mouse: { value: new THREE.Vector2(0, 0) },
        mouseStrength: { value: 0.0 },
      },
      vertexShader: `
                uniform float time;
                uniform vec2 mouse;
                uniform float mouseStrength;
                varying vec3 vNormal;
                varying vec3 vPosition;

                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
                float snoise(vec3 v) {
                    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
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
                    i = mod289(i);
                    vec4 p = permute(permute(permute(
                                i.z + vec4(0.0, i1.z, i2.z, 1.0))
                            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
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
                    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
                    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
                }

                void main() {
                    vNormal = normal;
                    vPosition = position;

                    // Base organic noise
                    float displacement = snoise(position * 2.0 + time * 0.5) * 0.25;

                    // World-space normal so effect tracks screen-space cursor correctly
                    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
                    vec3 mouseDir = normalize(vec3(mouse.x, mouse.y, 1.0));
                    float alignment = dot(worldNormal, mouseDir); // -1 to 1

                    // Gentle uniform bend across the whole front face — no single point
                    float frontFace = max(0.0, alignment);
                    float mouseDisp = -frontFace * mouseStrength * 0.35;

                    vec3 newPosition = position + normal * (displacement + mouseDisp);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
                }`,
      fragmentShader: `
                uniform vec3 color;
                uniform vec3 pointLightPos;
                uniform float mouseStrength;
                varying vec3 vNormal;
                varying vec3 vPosition;

                void main() {
                    vec3 normal = normalize(vNormal);
                    vec3 lightDir = normalize(pointLightPos - vPosition);
                    float diffuse = max(dot(normal, lightDir), 0.0);

                    float fresnel = 1.0 - dot(normal, vec3(0.0, 0.0, 1.0));
                    fresnel = pow(fresnel, 2.0);

                    // Subtle brightening when mouse is active
                    float boost = 1.0 + mouseStrength * 0.3;
                    vec3 finalColor = color * diffuse * boost + color * fresnel * 0.5;

                    gl_FragColor = vec4(finalColor, 1.0);
                }`,
      wireframe: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    pointLight.position.set(0, 0, 5);
    (lightRef as any).current = pointLight;
    scene.add(pointLight);

    // Smoothed state for fluid interpolation
    const targetMouse = new THREE.Vector2(0, 0);
    const currentMouse = new THREE.Vector2(0, 0);
    const targetLightPos = new THREE.Vector3(0, 0, 5);
    const currentLightPos = new THREE.Vector3(0, 0, 5);
    let targetMouseStrength = 0;
    let currentMouseStrength = 0;
    let targetRotY = 0;
    let targetRotX = 0;
    let isHovering = false;

    // Drag-to-spin state
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartRotY = 0;
    let dragStartRotX = 0;
    // Smoothed angular velocity on both axes
    let velY = 0.0005;
    let velX = 0;
    let rawDeltaY = 0; // unsmoothed drag delta this frame
    let rawDeltaX = 0;
    const IDLE_VEL_Y = 0.0005;
    const FRICTION = 0.975;
    const SENSITIVITY = 0.008;
    const VEL_SMOOTH = 0.18; // lerp factor for velocity smoothing during drag
    let lastDragX = 0;
    let lastDragY = 0;

    let frameId: number;
    const animate = (t: number) => {
      const lerpFactor = 0.088;

      currentMouse.lerp(targetMouse, lerpFactor);
      material.uniforms.mouse.value.copy(currentMouse);

      currentLightPos.lerp(targetLightPos, lerpFactor);
      if (lightRef.current) lightRef.current.position.copy(currentLightPos);
      material.uniforms.pointLightPos.value.copy(currentLightPos);

      currentMouseStrength += (targetMouseStrength - currentMouseStrength) * 0.075;
      material.uniforms.mouseStrength.value = currentMouseStrength;

      if (isDragging) {
        // Lerp velocity toward raw delta — smooth acceleration, no snap
        velY += (rawDeltaY - velY) * VEL_SMOOTH;
        velX += (rawDeltaX - velX) * VEL_SMOOTH;
        rawDeltaY = 0;
        rawDeltaX = 0;
      } else {
        // Decay Y toward idle, X toward zero
        if (Math.abs(velY) > IDLE_VEL_Y) {
          velY *= FRICTION;
        } else {
          velY += (IDLE_VEL_Y - velY) * 0.02;
        }
        velX *= FRICTION;
      }

      mesh.rotation.y += velY;
      mesh.rotation.x += velX;

      material.uniforms.time.value = t * 0.0003;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate(0);

    const handleResize = () => {
      camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    };

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartRotY = mesh.rotation.y;
      dragStartRotX = mesh.rotation.x;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      velY = 0;
      velX = 0;
      rawDeltaY = 0;
      rawDeltaX = 0;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        // Accumulate raw delta — animate loop smooths it into velocity
        rawDeltaY = (e.clientX - lastDragX) * SENSITIVITY;
        rawDeltaX = (e.clientY - lastDragY) * SENSITIVITY;
        mesh.rotation.y = dragStartRotY + (e.clientX - dragStartX) * SENSITIVITY;
        mesh.rotation.x = dragStartRotX + (e.clientY - dragStartY) * SENSITIVITY;
        lastDragX = e.clientX;
        lastDragY = e.clientY;
        return;
      }

      isHovering = true;
      // Compute position relative to the canvas element so (0,0) = center of sphere
      const rect = currentMount.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      targetMouse.set(x, y);
      targetMouseStrength = 1.0;

      const vec = new THREE.Vector3(x, y, 0.5).unproject(camera);
      const dir = vec.sub(camera.position).normalize();
      const dist = -camera.position.z / dir.z;
      const pos = camera.position.clone().add(dir.multiplyScalar(dist));
      targetLightPos.copy(pos).setZ(5);

      targetRotY = mesh.rotation.y + x * 0.4;
      targetRotX = mesh.rotation.x - y * 0.3;
    };

    const handleMouseUp = () => {
      isDragging = false;
    };

    const handleMouseLeave = () => {
      isDragging = false;
      isHovering = false;
      targetMouse.set(0, 0);
      targetMouseStrength = 0;
      targetLightPos.set(0, 0, 5);
    };

    currentMount.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("resize", handleResize);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      cancelAnimationFrame(frameId);
      currentMount.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      currentMount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 w-full h-full z-0" />;
}

export function AnomalousMatterHero({
  title,
  subtitle,
  description,
  showContent = false,
  className,
}: {
  title?: string;
  subtitle?: string;
  description?: string;
  showContent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-full h-full bg-transparent",
        className
      )}
    >
      <Suspense fallback={<div className="w-full h-full bg-transparent" />}>
        <div className="opacity-90 w-full h-full">
          <GenerativeArtScene />
        </div>
      </Suspense>

      {showContent && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center h-full pb-20 text-center pointer-events-none">
          <div className="max-w-3xl px-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {title && (
              <h1 className="text-xs font-mono tracking-widest text-teach-accent-bright uppercase mb-4">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-3xl md:text-5xl font-bold leading-tight mb-6 text-teach-text-primary">
                {subtitle}
              </p>
            )}
            {description && (
              <p className="max-w-xl mx-auto text-base leading-relaxed text-teach-text-secondary">
                {description}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
