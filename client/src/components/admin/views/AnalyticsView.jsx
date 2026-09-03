import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { BarChart2, Download, RefreshCw, TrendingUp, User, Wifi } from 'lucide-react'
import { Button, EmptyState, Panel, StatTile } from '../ui'

/* Charts sit on a #0f0f0f surface, so the old #444/#555 axis colours were all
   but invisible. These options are tuned for the dark panel. */
const AXIS = 'rgba(255,255,255,0.38)'
const GRID = 'rgba(255,255,255,0.05)'

const TOOLTIP = {
  backgroundColor: '#161616',
  borderColor: 'rgba(255,255,255,0.1)',
  borderWidth: 1,
  padding: 10,
  titleColor: '#fff',
  bodyColor: 'rgba(255,255,255,0.7)',
  displayColors: false,
}

export const LINE_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { labels: { color: 'rgba(255,255,255,0.6)', boxWidth: 10, boxHeight: 10, padding: 16, usePointStyle: true } },
    tooltip: TOOLTIP,
  },
  scales: {
    x: { ticks: { color: AXIS, maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false }, border: { color: GRID } },
    y: { ticks: { color: AXIS, precision: 0, font: { size: 10 } }, grid: { color: GRID }, border: { display: false }, beginAtZero: true },
  },
}

export const BAR_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y',
  plugins: { legend: { display: false }, tooltip: TOOLTIP },
  scales: {
    x: { ticks: { color: AXIS, precision: 0, font: { size: 10 } }, grid: { color: GRID }, border: { display: false }, beginAtZero: true },
    y: { ticks: { color: AXIS, font: { size: 10 } }, grid: { display: false }, border: { display: false } },
  },
}

export const DONUT_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '68%',
  plugins: {
    legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.6)', boxWidth: 9, boxHeight: 9, padding: 14, usePointStyle: true, font: { size: 11 } } },
    tooltip: TOOLTIP,
  },
}

export default function AnalyticsView({
  liveStats, uniqueMachines, todaysLaunches, totalDownloads,
  activityChart, versionsChart, downloadsChart, hasVersions, hasDownloads, onResetStats,
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Wifi}       label="Active users"    value={liveStats.activeUsers || 0}  color="#10b981" live />
        <StatTile icon={Download}   label="In game"         value={liveStats.playingUsers || 0} color="#3b82f6" live />
        <StatTile icon={User}       label="Unique machines" value={uniqueMachines.toLocaleString()} color="#8b5cf6" hint="All time" />
        <StatTile icon={BarChart2}  label="Launches today"  value={todaysLaunches} color="#e27602" />
      </div>

      <Panel title="Live activity" description="Sampled every time the server broadcasts an update — the last 20 samples.">
        <div className="h-72">
          {activityChart.labels.length > 1
            ? <Line data={activityChart} options={LINE_OPTS} />
            : <EmptyState className="h-full" icon={TrendingUp} title="Collecting samples" message="The graph fills in as realtime updates arrive." />}
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Launcher versions" description="How the installed base splits across releases.">
          <div className="h-72">
            {hasVersions
              ? <Doughnut data={versionsChart} options={DONUT_OPTS} />
              : <EmptyState className="h-full" icon={TrendingUp} title="No version data yet" message="Version numbers appear once clients report in." />}
          </div>
        </Panel>

        <Panel title="Top downloads" description="The ten most downloaded items across all content types.">
          <div className="h-72">
            {hasDownloads
              ? <Bar data={downloadsChart} options={BAR_OPTS} />
              : <EmptyState className="h-full" icon={TrendingUp} title="No downloads recorded" message="Counts appear as soon as content is downloaded." />}
          </div>
        </Panel>
      </div>

      <Panel
        title="Danger zone"
        description="Irreversible. Analytics history cannot be restored once cleared."
        className="border-red-500/20"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-bold text-white">Reset all analytics</p>
            <p className="mt-0.5 text-xs text-white/[0.38]">
              Wipes download counts, launch history, version distribution and machine identifiers.
            </p>
          </div>
          <Button size="lg" variant="danger" icon={RefreshCw} onClick={onResetStats}>Reset analytics</Button>
        </div>
      </Panel>
    </div>
  )
}
