"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface BoundingBox {
  id: string;
  x: number;      // percentage of image width
  y: number;      // percentage of image height
  width: number;  // percentage
  height: number; // percentage
  label: string;
  source: "user" | "model";
  confidence?: number;
}

interface AnnotationCanvasProps {
  imageSrc: string;
  userBoxes: BoundingBox[];
  modelBoxes: BoundingBox[];
  showUserLayer: boolean;
  showModelLayer: boolean;
  showHeatmap: boolean;
  activeTool: "draw" | "select" | null;
  onBoxDrawn: (box: Omit<BoundingBox, "id" | "source">) => void;
  onBoxSelect: (id: string) => void;
  onBoxMove: (id: string, x: number, y: number) => void;
  selectedBoxId: string | null;
  isAnalyzing: boolean;
  heatmapCenter?: { x: number; y: number };
}

export function AnnotationCanvas({
  imageSrc,
  userBoxes,
  modelBoxes,
  showUserLayer,
  showModelLayer,
  showHeatmap,
  activeTool,
  onBoxDrawn,
  onBoxSelect,
  onBoxMove,
  selectedBoxId,
  isAnalyzing,
  heatmapCenter,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  // Drag-to-move state
  const dragState = useRef<{
    id: string;
    startMouseX: number;
    startMouseY: number;
    startBoxX: number;
    startBoxY: number;
    boxW: number;
    boxH: number;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const getRelativePosition = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return null;
    const imgEl = container.querySelector("img");
    if (!imgEl) return null;
    const rect = imgEl.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }, []);

  const getImageRect = useCallback(() => {
    const container = containerRef.current;
    if (!container) return null;
    const imgEl = container.querySelector("img");
    if (!imgEl) return null;
    return imgEl.getBoundingClientRect();
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool !== "draw") return;
    const pos = getRelativePosition(e);
    if (!pos) return;
    setIsDrawing(true);
    setDrawStart(pos);
    setDrawCurrent(pos);
  }, [activeTool, getRelativePosition]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Box drag move
    if (dragState.current) {
      const rect = getImageRect();
      if (!rect) return;
      const dx = ((e.clientX - dragState.current.startMouseX) / rect.width) * 100;
      const dy = ((e.clientY - dragState.current.startMouseY) / rect.height) * 100;
      const newX = Math.max(0, Math.min(100 - dragState.current.boxW, dragState.current.startBoxX + dx));
      const newY = Math.max(0, Math.min(100 - dragState.current.boxH, dragState.current.startBoxY + dy));
      onBoxMove(dragState.current.id, newX, newY);
      return;
    }

    if (!isDrawing || activeTool !== "draw") return;
    const pos = getRelativePosition(e);
    if (pos) setDrawCurrent(pos);
  }, [isDrawing, activeTool, getRelativePosition, getImageRect, onBoxMove]);

  const handleMouseUp = useCallback(() => {
    // End box drag
    if (dragState.current) {
      dragState.current = null;
      setDraggingId(null);
      return;
    }

    if (!isDrawing || !drawStart || !drawCurrent) {
      setIsDrawing(false);
      return;
    }

    const x = Math.min(drawStart.x, drawCurrent.x);
    const y = Math.min(drawStart.y, drawCurrent.y);
    const width = Math.abs(drawCurrent.x - drawStart.x);
    const height = Math.abs(drawCurrent.y - drawStart.y);

    if (width > 2 && height > 2) {
      onBoxDrawn({ x, y, width, height, label: "" });
    }

    setIsDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
  }, [isDrawing, drawStart, drawCurrent, onBoxDrawn]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
  }, []);

  // Current drawing rectangle
  const drawRect = isDrawing && drawStart && drawCurrent ? {
    x: Math.min(drawStart.x, drawCurrent.x),
    y: Math.min(drawStart.y, drawCurrent.y),
    width: Math.abs(drawCurrent.x - drawStart.x),
    height: Math.abs(drawCurrent.y - drawStart.y),
  } : null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative inline-block select-none",
        activeTool === "draw" && "cursor-crosshair"
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        if (isDrawing) handleMouseUp();
      }}
    >
      <img
        src={imageSrc}
        alt="Scan"
        onLoad={handleImageLoad}
        className={cn(
          "max-w-full max-h-full object-contain rounded-2xl transition-all duration-700",
          isAnalyzing && "opacity-30 grayscale blur-sm"
        )}
        draggable={false}
      />

      {/* Loading overlay */}
      {isAnalyzing && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-cherry/30 border-t-cherry rounded-full animate-spin" />
            <span className="font-mono text-[11px] text-ink-muted uppercase tracking-wider">Running model...</span>
          </div>
        </div>
      )}

      {/* Grad-CAM heatmap overlay */}
      {showHeatmap && heatmapCenter && !isAnalyzing && (
        <div
          className="absolute inset-0 pointer-events-none mix-blend-multiply rounded-2xl transition-opacity duration-500"
          style={{
            background: `radial-gradient(circle at ${heatmapCenter.x}% ${heatmapCenter.y}%, rgba(181,101,10,0.55) 0%, rgba(232,184,75,0.3) 15%, rgba(232,184,75,0.1) 30%, transparent 50%)`,
          }}
        />
      )}

      {/* User annotation boxes */}
      {showUserLayer && userBoxes.map((box) => (
        <div
          key={box.id}
          onMouseDown={(e) => {
            e.stopPropagation();
            onBoxSelect(box.id);
            dragState.current = {
              id: box.id,
              startMouseX: e.clientX,
              startMouseY: e.clientY,
              startBoxX: box.x,
              startBoxY: box.y,
              boxW: box.width,
              boxH: box.height,
            };
            setDraggingId(box.id);
          }}
          style={{
            left: `${box.x}%`,
            top: `${box.y}%`,
            width: `${box.width}%`,
            height: `${box.height}%`,
          }}
          className={cn(
            "absolute border-2 transition-colors",
            draggingId === box.id ? "cursor-grabbing" : "cursor-grab",
            selectedBoxId === box.id
              ? "border-[#5B9BD5] bg-[#5B9BD5]/10 shadow-[0_0_0_1px_rgba(91,155,213,0.3)]"
              : "border-[#5B9BD5]/80 bg-[#5B9BD5]/5"
          )}
        >
          {box.label && (
            <div className="absolute -top-6 left-0 bg-[#5B9BD5] text-white px-2 py-0.5 rounded font-mono text-[10px] font-semibold whitespace-nowrap shadow-sm">
              {box.label}
            </div>
          )}
          {!box.label && (
            <div className="absolute -top-6 left-0 bg-[#5B9BD5]/60 text-white px-2 py-0.5 rounded font-mono text-[10px] italic whitespace-nowrap">
              unlabeled
            </div>
          )}
        </div>
      ))}

      {/* Model prediction boxes */}
      {showModelLayer && modelBoxes.map((box) => (
        <div
          key={box.id}
          style={{
            left: `${box.x}%`,
            top: `${box.y}%`,
            width: `${box.width}%`,
            height: `${box.height}%`,
          }}
          className="absolute border-2 border-dashed border-[#2BBCB3] bg-[#2BBCB3]/5 pointer-events-none"
        >
          <div className="absolute -top-6 left-0 bg-[#2BBCB3] text-white px-2 py-0.5 rounded font-mono text-[10px] font-semibold whitespace-nowrap shadow-sm flex items-center gap-1">
            {box.label}
            {box.confidence !== undefined && (
              <span className="opacity-80">{box.confidence}%</span>
            )}
          </div>
        </div>
      ))}

      {/* Current drawing preview */}
      {drawRect && drawRect.width > 1 && drawRect.height > 1 && (
        <div
          style={{
            left: `${drawRect.x}%`,
            top: `${drawRect.y}%`,
            width: `${drawRect.width}%`,
            height: `${drawRect.height}%`,
          }}
          className="absolute border-2 border-[#5B9BD5] bg-[#5B9BD5]/10 pointer-events-none"
        />
      )}
    </div>
  );
}
