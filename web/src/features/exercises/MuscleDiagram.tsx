import createBodyHighlighter, { type Muscle } from 'body-highlighter';
import { useEffect, useRef } from 'react';
import type { MuscleGroup } from '@lifting/shared';

/** Our taxonomy → body-highlighter polygon names (front and back views). */
const MUSCLE_TO_POLYGONS: Record<MuscleGroup, Muscle[]> = {
  chest: ['chest'],
  lats: ['upper-back'],
  upper_back: ['upper-back', 'trapezius'],
  lower_back: ['lower-back'],
  traps: ['trapezius'],
  shoulders: ['front-deltoids', 'back-deltoids'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  quads: ['quadriceps'],
  hamstrings: ['hamstring'],
  glutes: ['gluteal'],
  calves: ['calves', 'left-soleus', 'right-soleus'],
  adductors: ['adductor'],
  abductors: ['abductors'],
  abs: ['abs'],
  obliques: ['obliques'],
  neck: ['neck'],
};

const PRIMARY_COLOR = '#4ade80';
const SECONDARY_COLOR = '#166534';
const BODY_COLOR = '#404040';

interface Props {
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  className?: string;
}

/** Front + back body figures with primary muscles bright, secondary dim. */
export function MuscleDiagram({ primary, secondary, className }: Props) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const secondaryPolys = secondary.flatMap((m) => MUSCLE_TO_POLYGONS[m] ?? []);
    const primaryPolys = primary.flatMap((m) => MUSCLE_TO_POLYGONS[m] ?? []);

    // frequency 1 → secondary color, frequency 2 → primary color.
    const data = [
      { name: 'secondary', muscles: secondaryPolys },
      { name: 'primary', muscles: primaryPolys },
      { name: 'primary2', muscles: primaryPolys },
    ];

    const shared = {
      data,
      bodyColor: BODY_COLOR,
      highlightedColors: [SECONDARY_COLOR, PRIMARY_COLOR],
      style: { width: '100%' },
    };

    const instances = [
      frontRef.current && createBodyHighlighter({ ...shared, container: frontRef.current, type: 'anterior' }),
      backRef.current && createBodyHighlighter({ ...shared, container: backRef.current, type: 'posterior' }),
    ];

    return () => {
      for (const el of [frontRef.current, backRef.current]) {
        if (el) el.innerHTML = '';
      }
      void instances;
    };
  }, [primary.join(), secondary.join()]);

  return (
    <div className={`flex justify-center gap-2 ${className ?? ''}`}>
      <div ref={frontRef} className="w-28" aria-label="Muscles worked, front view" />
      <div ref={backRef} className="w-28" aria-label="Muscles worked, back view" />
    </div>
  );
}
