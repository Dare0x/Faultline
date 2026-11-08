import { rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const integratorsUrl = 'https://nearstats.org/api/integrators.json';
const dailyUrl = (slug) => `https://api.llama.fi/summary/dexs/${slug}?dataType=dailyVolume`;
const days = ['2026-09-10', '2026-10-11'];

async function fetchSource(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const raw = await response.text();
  return { data: JSON.parse(raw), url, sha256: createHash('sha256').update(raw).digest('hex') };
}

function captureWindow(window) {
  if (!window?.available || !window.totalVolumeUsd || !window.rows?.length) {
    throw new Error(`Missing routing window ${window?.key}`);
  }
  const { key, label, rangeLabel, startsAt, endsAt, totalVolumeUsd, totalSwaps, rows } = window;
  return {
    key, label, rangeLabel, startsAt, endsAt, totalVolumeUsd, totalSwaps,
    rows: rows.map(({ slug, name, volumeUsd, swaps, untagged, firstParty, vias }) => ({
      slug, name, volumeUsd, swaps, untagged, firstParty,
      vias: vias.map(({ slug, name, volumeUsd, swaps }) => ({ slug, name, volumeUsd, swaps })),
    })),
  };
}

function captureDaily({ data, url, sha256 }) {
  const rows = data.totalDataChart
    .map(([unix, volumeUsd]) => ({ date: new Date(unix * 1000).toISOString().slice(0, 10), volumeUsd }))
    .filter(({ date }) => date >= days[0] && date <= days[1]);
  const expectedDays = (Date.parse(days[1]) - Date.parse(days[0])) / 86_400_000 + 1;
  if (rows.length !== expectedDays || new Set(rows.map(({ date }) => date)).size !== expectedDays) {
    throw new Error(`${url} did not return every requested UTC day`);
  }
  return { url, sha256, rows };
}

const [routes, near, peer] = await Promise.all([
  fetchSource(integratorsUrl), fetchSource(dailyUrl('near-intents')), fetchSource(dailyUrl('chainflip')),
]);
if (!routes.data.ready || !routes.data.generatedAt) throw new Error('NearStats snapshot is unavailable');

const snapshot = {
  version: 1,
  routing: {
    url: routes.url,
    sha256: routes.sha256,
    generatedAt: routes.data.generatedAt,
    license: routes.data.license,
    attribution: routes.data.attribution,
    windows: ['24h', '7d', '30d'].map((key) => captureWindow(routes.data.windows[key])),
  },
  replay: {
    near: captureDaily(near),
    peer: captureDaily(peer),
  },
};

const snapshotPath = new URL('../dist/data/snapshot.json', import.meta.url);
const stagedPath = new URL('../dist/data/snapshot.next.json', import.meta.url);
await writeFile(stagedPath, `${JSON.stringify(snapshot)}\n`);
await rename(stagedPath, snapshotPath);
process.stdout.write(`Captured ${snapshot.routing.generatedAt} and ${snapshot.replay.near.rows.length} days of replay inputs.\n`);
