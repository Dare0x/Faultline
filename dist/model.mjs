export const benchmarkOptions = [
  { id: 'weekday', name: 'Previous week', detail: 'Same weekdays, one week earlier.' },
  { id: 'trend', name: 'Carry forward the decline', detail: 'Applies the change from Sep 17–20 to Sep 24–27 one more time.' },
  { id: 'peer', name: 'Match Chainflip’s change', detail: 'Applies Chainflip’s change between the same four-day windows.' },
];

const sum = (rows, value) => rows.reduce((total, row) => total + value(row), 0);

export function providers(window) {
  const groups = new Map();
  for (const app of window.rows) {
    for (const route of app.vias) {
      if (route.volumeUsd <= 0) continue;
      const group = groups.get(route.slug) ?? { slug: route.slug, name: route.name, volumeUsd: 0 };
      group.volumeUsd += route.volumeUsd;
      groups.set(route.slug, group);
    }
  }
  return [...groups.values()].sort((a, b) => b.volumeUsd - a.volumeUsd);
}

export function exposure(window, providerSlug, reroutePercent = 0) {
  if (!Number.isFinite(reroutePercent) || reroutePercent < 0 || reroutePercent > 100) {
    throw new RangeError('Rerouting must be between 0 and 100 percent');
  }
  const apps = window.rows.map((row) => ({
    ...row,
    exposedUsd: sum(row.vias.filter((route) => route.slug === providerSlug), (route) => route.volumeUsd),
  }));
  const affected = apps.filter((app) => app.exposedUsd > 0).sort((a, b) => b.exposedUsd - a.exposedUsd);
  const exposedUsd = sum(affected, (app) => app.exposedUsd);
  const withoutProviderUsd = window.totalVolumeUsd - sum(apps, (app) => sum(app.vias, (route) => route.volumeUsd));
  const displacedUsd = exposedUsd * (1 - reroutePercent / 100);
  return {
    apps, affected, exposedUsd, withoutProviderUsd, displacedUsd,
    observedShare: exposedUsd / window.totalVolumeUsd,
    retainedUsd: window.totalVolumeUsd - displacedUsd,
  };
}

export function riskLimit(exposedUsd, totalUsd, limitPercent) {
  const limitUsd = totalUsd * limitPercent / 100;
  const minimum = exposedUsd > limitUsd ? 100 * (exposedUsd - limitUsd) / exposedUsd : 0;
  // Round up to the slider's next whole-percent step, allowing for floating-point noise.
  const minimumReroutePercent = Math.max(0, Math.ceil(minimum - 100 * Number.EPSILON));
  return { limitUsd, minimumReroutePercent };
}

export const periods = [
  { label: 'Sep 17–20', start: '2026-09-17', end: '2026-09-20', kind: 'prior' },
  { label: 'Sep 24–27', start: '2026-09-24', end: '2026-09-27', kind: 'prior' },
  { label: 'Oct 1–4', start: '2026-10-01', end: '2026-10-04', kind: 'incident' },
  { label: 'Oct 8–11', start: '2026-10-08', end: '2026-10-11', kind: 'after' },
];

function periodTotal(source, period) {
  const rows = source.rows.filter(({ date }) => date >= period.start && date <= period.end);
  if (rows.length !== 4 || new Set(rows.map(({ date }) => date)).size !== 4) {
    throw new Error(`Incomplete daily inputs for ${period.label}`);
  }
  return sum(rows, (row) => row.volumeUsd);
}

export function replay(snapshot, benchmarkId = 'weekday') {
  const history = periods.map((period) => ({ ...period, volumeUsd: periodTotal(snapshot.near, period) }));
  const [early, prior, incident] = history;
  const peerPrior = periodTotal(snapshot.peer, periods[1]);
  const peerIncident = periodTotal(snapshot.peer, periods[2]);
  if (!early.volumeUsd || !prior.volumeUsd || !peerPrior || !peerIncident) {
    throw new Error('A replay reference period is empty');
  }
  const references = {
    weekday: prior.volumeUsd,
    trend: prior.volumeUsd * (prior.volumeUsd / early.volumeUsd),
    peer: prior.volumeUsd * (peerIncident / peerPrior),
  };
  const expectedUsd = references[benchmarkId];
  if (!Number.isFinite(expectedUsd)) throw new RangeError('Unknown replay benchmark');
  return {
    history, expectedUsd, actualUsd: incident.volumeUsd, references, peerPrior, peerIncident,
    change: (incident.volumeUsd - expectedUsd) / expectedUsd,
  };
}
