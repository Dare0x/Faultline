import { benchmarkOptions, exposure, providers, replay } from './model.mjs';

const byId = (id) => document.getElementById(id);
const moneyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2,
});
const exactMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const percentageFormat = new Intl.NumberFormat('en-US', {
  style: 'percent', maximumFractionDigits: 1,
});
const money = (usd) => moneyFormat.format(usd);
const percent = (ratio) => percentageFormat.format(ratio);
const rounded = new Intl.NumberFormat('en-US');
const utcTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sizedSlice(className, usd, maximum) {
  const node = element('span', className);
  node.style.width = percent(usd / maximum);
  return node;
}

function drawRouteBoard(result, provider, isOutage) {
  const apps = result.affected.slice(0, 4);
  const board = byId('route-board');
  board.dataset.outage = String(isOutage);
  byId('board-provider').textContent = provider;
  byId('board-state').textContent = isOutage ? 'Removed in simulation' : 'Present in snapshot';

  const list = byId('board-apps');
  list.replaceChildren(...apps.map((app) => {
    const item = element('li', 'board-app');
    item.append(element('strong', '', app.name), element('span', '', money(app.exposedUsd)));
    return item;
  }));

  const wires = byId('board-wires');
  wires.replaceChildren(...apps.map((_, index) => {
    const inputY = (index + 0.5) * 224 / apps.length;
    const portY = 112 + (index - (apps.length - 1) / 2) * 17;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'route-wire');
    path.setAttribute('d', 'M 0 ' + inputY + ' H 17 C 76 ' + inputY + ' 71 ' + portY + ' 139 ' + portY +
      ' H ' + (isOutage ? 143 : 160));
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    return path;
  }));

  const remaining = result.affected.length - apps.length;
  const caption = apps.length ? 'Amounts show observed volume through ' + provider + ' for each entry.' :
    'The snapshot has no volume attributed to the selected route in this window.';
  byId('board-caption').textContent = remaining > 0
    ? caption + ' ' + rounded.format(remaining) + ' more entries share this route.'
    : caption;
}

function drawRouteShare(result, provider, totalUsd, isOutage) {
  const shares = isOutage
    ? [
      { kind: 'displaced', label: 'Modeled displacement', usd: result.displacedUsd },
      { kind: 'rerouted', label: 'Assumed rerouted', usd: result.exposedUsd - result.displacedUsd },
    ]
    : [{ kind: 'observed', label: 'Via ' + provider, usd: result.exposedUsd }];
  shares.push({ kind: 'other', label: 'Other observed volume', usd: totalUsd - result.exposedUsd });

  byId('route-share-bar').replaceChildren(...shares.map(({ kind, usd }) => {
    const segment = element('span', 'share-' + kind);
    segment.style.width = (totalUsd > 0 ? 100 * usd / totalUsd : 0) + '%';
    return segment;
  }));
  byId('route-share-key').replaceChildren(...shares.map(({ kind, label, usd }) => {
    const item = element('li');
    const swatch = element('i', 'swatch share-' + kind);
    swatch.setAttribute('aria-hidden', 'true');
    item.append(swatch, element('span', '', label), element('strong', '', totalUsd > 0 ? percent(usd / totalUsd) : '—'));
    return item;
  }));
}

function drawRouting(rows, result, provider, isOutage, reroutePercent) {
  const maximum = Math.max(1, ...rows.map((row) => row.volumeUsd));
  byId('routing-rows').replaceChildren(...rows.map((app) => {
    const row = element('div', 'route-row');
    const heading = element('div', 'route-row-head');
    heading.append(element('span', '', app.name), element('span', '', money(app.volumeUsd)));
    const bar = element('div', 'bar-track');
    const rerouted = isOutage ? app.exposedUsd * reroutePercent / 100 : 0;
    const displaced = isOutage ? app.exposedUsd - rerouted : 0;
    bar.setAttribute('aria-hidden', 'true');
    bar.append(
      sizedSlice('other-slice', app.volumeUsd - app.exposedUsd + rerouted, maximum),
      sizedSlice('provider-slice', app.exposedUsd - rerouted - displaced, maximum),
      sizedSlice('displaced-slice', displaced, maximum),
    );
    const footer = element('div', 'route-row-foot');
    footer.append(element('span', '', money(app.exposedUsd) + ' via ' + provider));
    if (isOutage && app.exposedUsd > 0) {
      footer.append(element('span', 'removed', money(displaced) + ' displaced in scenario'));
    }
    row.append(heading, bar, footer);
    return row;
  }));
  byId('legend-provider').textContent = isOutage ? provider + ' flow displaced' : 'Flow via ' + provider;
  byId('legend-remainder').textContent = isOutage ? 'Flow remaining in scenario' : 'Other or unclassified flow';
  byId('routing-note').textContent =
    'Showing ' + rows.length + ' apps. The scenario includes every row with attributed provider volume (' +
    rounded.format(result.affected.length) + ' affected entries).';
}

function drawExposureEvidence(result, provider, window, windowDates, reroutePercent, isOutage) {
  byId('exposure-window').textContent = windowDates + ' · NearStats 1Click snapshot';
  byId('exposure-provider-label').textContent = 'Volume via ' + provider;
  byId('exposure-numerator').textContent = exactMoney.format(result.exposedUsd);
  byId('exposure-denominator').textContent = exactMoney.format(window.totalVolumeUsd);
  byId('exposure-share').textContent = percent(result.observedShare);
  byId('exposure-entries-title').textContent = 'Contributing entries (' + rounded.format(result.affected.length) + ')';
  byId('exposure-entries').replaceChildren(...result.affected.map((app) => {
    const row = element('tr');
    const name = element('th', '', app.name);
    name.scope = 'row';
    row.append(name, element('td', '', exactMoney.format(app.exposedUsd)), element('td', '', exactMoney.format(app.volumeUsd)));
    return row;
  }));
  const scenario = byId('exposure-scenario');
  scenario.hidden = !isOutage;
  scenario.textContent = 'With ' + reroutePercent + '% rerouting assumed, the model displaces ' +
    exactMoney.format(result.displacedUsd) + ' and retains ' + exactMoney.format(result.retainedUsd) + '.';
}

function setupRouting(snapshot) {
  const providerControl = byId('provider');
  const button = byId('outage-toggle');
  const range = byId('reroute');
  const evidence = byId('exposure-evidence');
  let window = snapshot.routing.windows.find(({ key }) => key === '30d');
  let isOutage = false;

  function fillProviders(preferred) {
    const choices = providers(window);
    providerControl.replaceChildren(...choices.map(({ slug, name }) => new Option(name, slug)));
    providerControl.value = choices.some(({ slug }) => slug === preferred) ? preferred : choices[0]?.slug ?? '';
    providerControl.disabled = !choices.length;
    button.disabled = !choices.length;
  }

  function render() {
    const providerName = providerControl.selectedOptions[0]?.textContent ?? 'Unavailable';
    const reroutePercent = Number(range.value);
    const result = exposure(window, providerControl.value, isOutage ? reroutePercent : 0);
    const windowDates = utcTime.formatRange(new Date(window.startsAt), new Date(window.endsAt)) + ' UTC';
    const byVolume = result.apps.filter(({ untagged, firstParty }) => !untagged && !firstParty)
      .sort((a, b) => b.volumeUsd - a.volumeUsd);
    const rows = byVolume.slice(0, 6);
    const visible = new Set(rows.map(({ slug }) => slug));
    rows.push(...result.affected.filter(({ slug, untagged }) => !untagged && !visible.has(slug)).slice(0, 2));
    drawRouteBoard(result, providerName, isOutage);
    drawRouteShare(result, providerName, window.totalVolumeUsd, isOutage);
    drawRouting(rows, result, providerName, isOutage, reroutePercent);
    drawExposureEvidence(result, providerName, window, windowDates, reroutePercent, isOutage);

    byId('exposure-amount').textContent = money(isOutage ? result.displacedUsd : result.exposedUsd);
    byId('exposure-label').textContent = isOutage
      ? percent(result.displacedUsd / window.totalVolumeUsd) + ' of observed volume displaced in this scenario'
      : percent(result.observedShare) + ' of observed 1Click volume routed via ' + providerName;
    byId('reroute-value').textContent = reroutePercent + '%';
    button.setAttribute('aria-pressed', String(isOutage));
    button.textContent = isOutage ? 'Reset scenario' : 'Simulate outage';
    byId('board-result').hidden = !isOutage;
    byId('board-result').textContent = money(result.displacedUsd) + ' modeled displacement';
    byId('reroute-controls').hidden = !isOutage;
    byId('scenario-summary').textContent = isOutage
      ? money(result.retainedUsd) + ' remains in the model under this assumption. Actual rerouting capacity is unknown.'
      : money(window.totalVolumeUsd) + ' observed across ' + rounded.format(window.totalSwaps) +
        ' swaps in this window. Choose a provider to test the exposure.';
    byId('scope-summary').textContent = windowDates + '. ' + money(result.withoutProviderUsd) +
      ' has no provider attribution in this dataset. Coverage is limited to the NearStats 1Click snapshot.';
  }

  byId('window-picker').addEventListener('change', (event) => {
    window = snapshot.routing.windows.find(({ key }) => key === event.target.value);
    fillProviders(providerControl.value);
    render();
  });
  providerControl.addEventListener('change', render);
  button.addEventListener('click', () => { isOutage = !isOutage; render(); });
  range.addEventListener('input', render);
  byId('exposure-link').addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = '#' + evidence.id;
    if (location.hash !== target) history.pushState(null, '', target);
    evidence.open = true;
    evidence.scrollIntoView();
    evidence.querySelector('summary').focus({ preventScroll: true });
  });
  evidence.open = location.hash === '#' + evidence.id;
  fillProviders('swapkit');
  render();
}

function setupReplay(snapshot) {
  const comparison = byId('benchmark');
  comparison.replaceChildren(...benchmarkOptions.map(({ id, name }) => new Option(name, id)));
  const { history, references } = replay(snapshot.replay);
  const maximum = Math.max(...history.map(({ volumeUsd }) => volumeUsd), ...Object.values(references));
  const unit = 10 ** Math.floor(Math.log10(maximum));
  const scale = Math.ceil(maximum / unit) * unit;
  const axis = element('div', 'history-axis');
  axis.setAttribute('aria-hidden', 'true');
  axis.append(...[scale, scale / 2, 0].map((value) => element('span', '', money(value))));
  const benchmarkFill = element('span', 'history-benchmark');

  byId('history').replaceChildren(axis, ...history.map((period) => {
    const column = element('div', 'history-column ' + period.kind);
    const bar = element('div', 'history-track');
    const barFill = element('span', 'history-fill');
    barFill.style.height = (100 * period.volumeUsd / scale) + '%';
    bar.setAttribute('aria-hidden', 'true');
    bar.append(barFill);
    if (period.kind === 'incident') bar.append(benchmarkFill);
    const label = element('div', 'history-label');
    label.append(element('span', '', period.label), element('strong', '', money(period.volumeUsd)));
    column.append(bar, label);
    return column;
  }));

  function render() {
    const benchmark = benchmarkOptions.find(({ id }) => id === comparison.value);
    const result = replay(snapshot.replay, benchmark.id);
    benchmarkFill.style.height = (100 * result.expectedUsd / scale) + '%';
    byId('benchmark-volume').textContent = money(result.expectedUsd);
    byId('benchmark-detail').textContent = benchmark.detail;
    byId('benchmark-delta').textContent = (result.change > 0 ? '+' : '') + percent(result.change);
    byId('benchmark-delta').classList.toggle('positive', result.change > 0);
    byId('benchmark-result').textContent = money(result.actualUsd) + ' observed vs ' +
      money(result.expectedUsd) + ' under this comparison.';
  }
  comparison.addEventListener('change', render);
  render();
}

async function start() {
  const response = await fetch(new URL('./data/snapshot.json', import.meta.url));
  if (!response.ok) throw new Error('Snapshot returned ' + response.status);
  const snapshot = await response.json();
  if (snapshot.version !== 1) throw new Error('Snapshot version is unsupported');
  setupRouting(snapshot);
  setupReplay(snapshot);
  byId('snapshot-date').textContent = 'Data snapshot · ' + utcTime.format(new Date(snapshot.routing.generatedAt)) + ' UTC';
  for (const id of ['stress-test', 'replay', 'evidence']) byId(id).hidden = false;
  if (location.hash === '#exposure-evidence') byId('exposure-evidence').scrollIntoView();
}

start().catch((error) => {
  console.error(error);
  byId('snapshot-date').textContent = 'Snapshot unavailable';
  const alert = byId('load-error');
  alert.hidden = false;
  alert.textContent = 'Could not load the model. Serve the dist folder over HTTP and check that data/snapshot.json is present.';
});
