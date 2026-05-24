import type { ModuleConfig } from "./types";

export interface ModuleDisplay extends ModuleConfig {
  name: string;
  desc: string;
  arch: string;
  size: string;
  latency: string;
}

export const MODULES: ModuleDisplay[] = [
  {
    slug: "chest_xray",
    label: "Chest X-Ray",
    name: "Chest X-Ray (Pathology Triage)",
    description: "Triage of acute cardiorespiratory emergencies, including Pneumonia, pleural effusion, atelectasis, and infiltration.",
    desc: "Triage of acute cardiorespiratory emergencies, including Pneumonia, pleural effusion, atelectasis, and infiltration.",
    taskModes: ["classification", "detection"],
    arch: "DenseNet-121",
    size: "30 MB",
    latency: "1–2 s",
  },
  {
    slug: "bone_fracture",
    label: "Bone Fracture",
    name: "Bone Fracture",
    description: "Wrist & long-bone fracture localization on the GRAZPEDWRI-DX dataset.",
    desc: "Wrist & long-bone fracture localization on the GRAZPEDWRI-DX dataset.",
    taskModes: ["classification", "detection"],
    arch: "YOLOv8n",
    size: "12 MB",
    latency: "3–10 fps",
  },
  {
    slug: "wound_burn",
    label: "Wound & Burn Care",
    name: "Wound & Burn Care",
    description: "Acute wound infection classification (cellulitis, necrotizing fasciitis) and burn-depth grading (1st, 2nd, 3rd degree).",
    desc: "Acute wound infection classification (cellulitis, necrotizing fasciitis) and burn-depth grading (1st, 2nd, 3rd degree).",
    taskModes: ["classification"],
    arch: "MobileNetV2",
    size: "9.2 MB",
    latency: "~120 ms",
  },
  {
    slug: "tb",
    label: "Tuberculosis",
    name: "Tuberculosis",
    description: "Specific TB detection and shelter outbreak screening on chest radiographs.",
    desc: "Specific TB detection and shelter outbreak screening on chest radiographs.",
    taskModes: ["classification"],
    arch: "DenseNet-121",
    size: "30 MB",
    latency: "1–2 s",
  },
  {
    slug: "malaria",
    label: "Malaria Screening",
    name: "Malaria Screening",
    description: "Giemsa-stained thin blood smear cell screening for Plasmodium falciparum.",
    desc: "Giemsa-stained thin blood smear cell screening for Plasmodium falciparum.",
    taskModes: ["classification"],
    arch: "MobileNetV2",
    size: "9.2 MB",
    latency: "~120 ms",
  },
];

/** Quick lookup by slug */
export const MODULE_MAP = new Map(MODULES.map((m) => [m.slug, m]));
