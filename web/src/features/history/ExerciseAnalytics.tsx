import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatWeight, toDisplay, type ExerciseStats } from '@lifting/shared';
import { useUser } from '@/lib/auth';
import { refs, useLiveDoc } from '@/lib/db';
import { useProfile } from '@/lib/profile';
import { ChartCard } from './AnalyticsOverview';
import { axisProps, chart, tooltipStyle } from './chartTheme';
import { useExerciseWeeks } from './useAggregates';

export function ExerciseAnalytics({ exerciseId }: { exerciseId: string }) {
  const user = useUser();
  const { unit } = useProfile();
  const weeks = useExerciseWeeks(exerciseId);
  const statsDoc = useLiveDoc(['exerciseStats', user.uid, exerciseId], refs.exerciseStats(user.uid, exerciseId));
  const stats = (statsDoc.data?.data as ExerciseStats | undefined) ?? null;

  const series = useMemo(
    () =>
      (weeks.data ?? []).map(({ id, data }) => ({
        week: id.slice(5),
        e1rm: Math.round(toDisplay(data.bestE1rmKg, unit)),
        top: Math.round(toDisplay(data.topSetWeightKg, unit)),
        volume: Math.round(toDisplay(data.volumeKg, unit)),
      })),
    [weeks.data, unit],
  );

  if (weeks.isPending) return <p className="text-neutral-500">Loading…</p>;
  if (series.length === 0) {
    return <p className="text-neutral-500">No completed sets for this exercise yet.</p>;
  }

  return (
    <div className="space-y-6">
      <ChartCard title={`Strength trend (${unit})`}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="week" {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={52} domain={['auto', 'auto']} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12, color: chart.text }} />
            <Line type="monotone" name="est. 1RM" dataKey="e1rm" stroke={chart.series1} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" name="top set" dataKey="top" stroke={chart.series2} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={`Weekly volume (${unit})`}>
        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={chart.grid} vertical={false} />
            <XAxis dataKey="week" {...axisProps} interval="preserveStartEnd" />
            <YAxis {...axisProps} width={52} />
            <Tooltip {...tooltipStyle} />
            <Line type="monotone" dataKey="volume" stroke={chart.series1} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {stats && <PrTable stats={stats} />}
    </div>
  );
}

function PrTable({ stats }: { stats: ExerciseStats }) {
  const { unit } = useProfile();
  const prs = Object.entries(stats.repPRs)
    .map(([reps, pr]) => ({ reps: Number(reps), ...pr }))
    .sort((a, b) => a.reps - b.reps);

  return (
    <ChartCard title="Personal records">
      {stats.bestE1rm && (
        <p className="mb-3 text-sm">
          Best est. 1RM:{' '}
          <span className="font-semibold text-accent">{formatWeight(stats.bestE1rm.valueKg, unit)}</span>{' '}
          <span className="text-neutral-500">
            ({formatWeight(stats.bestE1rm.weightKg, unit)} ×{stats.bestE1rm.reps} on{' '}
            {new Date(stats.bestE1rm.date).toLocaleDateString()})
          </span>
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500">
            <th className="py-1 font-normal">Reps</th>
            <th className="py-1 font-normal">Weight</th>
            <th className="py-1 font-normal">Date</th>
          </tr>
        </thead>
        <tbody>
          {prs.map((pr) => (
            <tr key={pr.reps} className="border-t border-neutral-800">
              <td className="py-1.5">{pr.reps}</td>
              <td className="py-1.5 font-mono">{formatWeight(pr.weightKg, unit)}</td>
              <td className="py-1.5 text-neutral-500">{new Date(pr.date).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartCard>
  );
}
