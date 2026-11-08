import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { benchmarkOptions, exposure, providers, replay } from '../dist/model.mjs';

const snapshot = JSON.parse(await readFile(new URL('../dist/data/snapshot.json', import.meta.url)));
const dollars = (value) => '$' + (value / 1e6).toFixed(2) + 'M';
const percent = (ratio) => (100 * ratio).toFixed(2) + '%';
const close = (actual, expected, tolerance = 0.01) => assert.ok(
  Math.abs(actual - expected) <= tolerance, String(actual) + ' is not within tolerance of ' + expected,
);

assert.equal(snapshot.version, 1);
assert.deepEqual(snapshot.routing.windows.map((window) => window.key), ['24h', '7d', '30d']);

for (const window of snapshot.routing.windows) {
  assert.ok(Date.parse(window.startsAt) < Date.parse(window.endsAt));
  assert.ok(window.totalVolumeUsd > 0);
  assert.equal(new Set(window.rows.map((app) => app.slug)).size, window.rows.length);
  close(window.rows.reduce((total, app) => total + app.volumeUsd, 0), window.totalVolumeUsd);
  for (const app of window.rows) {
    assert.ok(app.volumeUsd >= 0);
    assert.equal(new Set(app.vias.map((route) => route.slug)).size, app.vias.length);
    assert.ok(app.vias.every((route) => route.volumeUsd >= 0));
    assert.ok(app.vias.reduce((total, route) => total + route.volumeUsd, 0) <= app.volumeUsd + 0.01);
  }
  const swapkit = providers(window).find(({ slug }) => slug === 'swapkit');
  assert.ok(swapkit, 'Snapshot must include SwapKit');
  const withoutRerouting = exposure(window, 'swapkit');
  const partialRerouting = exposure(window, 'swapkit', 50);
  const fullRerouting = exposure(window, 'swapkit', 100);
  close(withoutRerouting.exposedUsd, swapkit.volumeUsd);
  close(withoutRerouting.displacedUsd + withoutRerouting.retainedUsd, window.totalVolumeUsd);
  close(partialRerouting.displacedUsd, withoutRerouting.exposedUsd / 2);
  close(fullRerouting.retainedUsd, window.totalVolumeUsd);
  assert.ok(withoutRerouting.withoutProviderUsd >= -0.01);
  assert.ok(withoutRerouting.affected.some((row) => row.exposedUsd < row.volumeUsd - 0.01),
    'Check that the data contains an app with partial routing attribution');
  console.log(window.key + ' SwapKit  ' + dollars(swapkit.volumeUsd) + ' / ' + dollars(window.totalVolumeUsd) +
    '  (' + percent(withoutRerouting.observedShare) + ', ' + withoutRerouting.affected.length + ' affected entries)');
}

const incident = replay(snapshot.replay);
assert.equal(incident.actualUsd, 390_161_724);
assert.equal(incident.expectedUsd, 570_480_703);
close(incident.change, -0.31608, 0.00001);
const trend = replay(snapshot.replay, 'trend');
close(trend.change, -0.06935, 0.0002);
assert.ok(replay(snapshot.replay, 'peer').change > 0, 'Peer comparison should differ in direction');

for (const benchmark of benchmarkOptions) {
  const result = replay(snapshot.replay, benchmark.id);
  console.log(benchmark.name + '  ' + dollars(result.actualUsd) + ' vs ' +
    dollars(result.expectedUsd) + '  (' + percent(result.change) + ')');
}
console.log('Routing inputs, scenario arithmetic, and replay comparisons verified.');
