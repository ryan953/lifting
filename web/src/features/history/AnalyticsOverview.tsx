import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MuscleGroup, WeightUnit } from '@lifting/shared';
import { toDisplay } from '@lifting/shared';
import { useProfile } from '@/lib/profile';
import { axisProps, chart, tooltipStyle } from './chartTheme';
import { useWeeklyStats } from './useAggregates';

export function AnalyticsOverview() {
  const { unit } = useProfile();
  const weekly = useWeeklyStats();
  const rows = weekly.data ?? [];

  const volumeSeries = useMemo(
    () =>
      rows.map(({ id, data }) => ({
        week: id.slice(5), // 'W29'
        sessions: data.sessionCount,
        volume: Math.round(
          toDisplay(
            Object.values(data.volumeByMuscleKg).reduce((a, b) => a + (b ?? 0), 0),
            unit,
          ),
        ),
        met: data.progression.met,
        attempted: data.progression.attempted,
      })),
    [rows, unit],
  );

  const successSeries = volumeSeries
    .filter((r) => r.attempted > 0)
    .map((r) => ({ week: r.week, rate: Math.round((r.met / r.attempted) * 100) }));

  if (weekly.isPending) return <p className="text-neutral-500">Loading analytics…</p>;
  if (rows.length === 0) {
    return <p className="text-neutral-500">Complete a few workouts to see analytics.</p>;
  }

  return (
    <div className="space-y-6">
      <ChartCard title={`Weekly volume (${unit})`}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={volumeSeries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={chart.grid} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="week" {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={52} />
            <Tooltip {...tooltipStyle} cursor={{ fill: '#ffffff10' }} />
            <Bar dataKey="volume" fill={chart.series1} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Sessions per week">
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={volumeSeries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="week" {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} allowDecimals={false} width={40} />
            <Tooltip {...tooltipStyle} cursor={{ fill: '#ffffff10' }} />
            <Bar dataKey="sessions" fill={chart.series2} radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {successSeries.length > 1 && (
        <ChartCard title="Progression success rate (%)">
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={successSeries} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="week" {...axisProps} interval="preserveStartEnd" />
              <YAxis {...axisProps} domain={[0, 100]} width={40} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="rate" stroke={chart.series1} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <MuscleVolumeCard unit={unit} />
      <FrequencyHeatmap />
      <RepRangeCard />
    </div>
  );
}

const MUSCLE_ORDER: MuscleGroup[] = [
  'chest', 'shoulders', 'triceps', 'lats', 'upper_back', 'traps', 'biceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'abs', 'obliques', 'lower_back', 'neck',
];

function MuscleVolumeCard({ unit }: { unit: WeightUnit }) {
  const weekly = useWeeklyStats(4);
  const rows = weekly.data ?? [];

  const totals = useMemo(() => {
    const acc = new Map<MuscleGroup, number>();
    for (const { data } of rows) {
      for (const [muscle, vol] of Object.entries(data.volumeByMuscleKg) as [MuscleGroup, number][]) {
        acc.set(muscle, (acc.get(muscle) ?? 0) + vol);
      }
    }
    return MUSCLE_ORDER.filter((m) => acc.has(m)).map((m) => ({
      muscle: m.replaceAll('_', ' '),
      volume: Math.round(toDisplay(acc.get(m)!, unit)),
    }));
  }, [rows, unit]);

  if (totals.length === 0) return null;

  return (
    <ChartCard title={`Volume by muscle — last 4 weeks (${unit})`}>
      <ResponsiveContainer width="100%" height={Math.max(160, totals.length * 26)}>
        <BarChart data={totals} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 10 }}>
          <CartesianGrid stroke={chart.grid} horizontal={false} />
          <XAxis type="number" {...axisProps} />
          <YAxis type="category" dataKey="muscle" {...axisProps} width={86} />
          <Tooltip {...tooltipStyle} cursor={{ fill: '#ffffff10' }} />
          <Bar dataKey="volume" fill={chart.series1} radius={[0, 4, 4, 0]} maxBarSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function FrequencyHeatmap() {
  const weekly = useWeeklyStats();
  const rows = weekly.data ?? [];

  const trained = useMemo(() => {
    const set = new Set<string>();
    for (const { data } of rows) for (const d of data.trainedDates) set.add(d);
    return set;
  }, [rows]);

  // Last 26 weeks as columns, Mon-Sun rows (GitHub-style).
  const weeks = useMemo(() => {
    const out: string[][] = [];
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    for (let w = 25; w >= 0; w--) {
      const col: string[] = [];
      for (let d = 0; d < 7; d++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() - w * 7 + d);
        col.push(day.toISOString().slice(0, 10));
      }
      out.push(col);
    }
    return out;
  }, []);

  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <ChartCard title="Training frequency — last 26 weeks">
      <div className="flex gap-[3px] overflow-x-auto pb-1" role="img" aria-label="Calendar heatmap of training days">
        {weeks.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((date) => (
              <div
                key={date}
                title={`${date}${trained.has(date) ? ' — trained' : ''}`}
                className="h-3 w-3 rounded-[3px]"
                style={{
                  background: trained.has(date) ? chart.sequential[2] : chart.cellEmpty,
                  opacity: date > todayKey ? 0.25 : 1,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

function RepRangeCard() {
  const weekly = useWeeklyStats();
  const rows = weekly.data ?? [];

  const totals = useMemo(() => {
    const acc = { r1_5: 0, r6_10: 0, r11_15: 0, r16p: 0 };
    for (const { data } of rows) {
      acc.r1_5 += data.setsByRepRange.r1_5;
      acc.r6_10 += data.setsByRepRange.r6_10;
      acc.r11_15 += data.setsByRepRange.r11_15;
      acc.r16p += data.setsByRepRange.r16p;
    }
    return [
      { range: '1–5', sets: acc.r1_5 },
      { range: '6–10', sets: acc.r6_10 },
      { range: '11–15', sets: acc.r11_15 },
      { range: '16+', sets: acc.r16p },
    ];
  }, [rows]);

  if (totals.every((t) => t.sets === 0)) return null;

  return (
    <ChartCard title="Working sets by rep range">
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={totals} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={chart.grid} vertical={false} />
          <XAxis dataKey="range" {...axisProps} />
          <YAxis {...axisProps} allowDecimals={false} width={40} />
          <Tooltip {...tooltipStyle} cursor={{ fill: '#ffffff10' }} />
          <Bar dataKey="sets" fill={chart.series3} radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-2xl bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-300">{title}</h2>
      {children}
    </section>
  );
}
