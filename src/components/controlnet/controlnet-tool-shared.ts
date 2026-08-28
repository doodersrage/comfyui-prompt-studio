import type { ControlNetMode } from '@/lib/controlnet-prompt';

export const CONTROLNET_ACCENT = 'cyan' as const;

export const CONTROLNET_MODES: { id: ControlNetMode; label: string }[] = [
  { id: 'depth', label: 'Depth' },
  { id: 'pose', label: 'Pose' },
  { id: 'canny', label: 'Canny / edges' },
  { id: 'normal', label: 'Normal map' },
  { id: 'lineart', label: 'Lineart' },
];
