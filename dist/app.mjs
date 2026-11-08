import { benchmarkOptions, exposure, providers, replay } from './model.mjs';

const byId = (id) => document.getElementById(id);
const moneyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2,
});
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

function setupRouting(snapshot) {
  const providerControl = byId('provider');
  const button = byId('outage-toggle');
  const range = byId('reroute');
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
    const byVolume = result.apps.filter(({ untagged, firstParty }) => !untagged && !firstParty)
      .sort((a, b) => b.volumeUsd - a.volumeUsd);
    const rows = byVolume.slice(0, 6);
    const visible = new Set(rows.map(({ slug }) => slug));
    rows.push(...result.affected.filter(({ slug, untagged }) => !untagged && !visible.has(slug)).slice(0, 2));
    drawRouting(rows, result, providerName, isOutage, reroutePercent);

    byId('exposure-amount').textContent = money(isOutage ? result.displacedUsd : result.exposedUsd);
    byId('exposure-label').textContent = isOutage
      ? percent(result.displacedUsd / window.totalVolumeUsd) + ' of observed volume displaced in this scenario'
      : percent(result.observedShare) + ' of observed 1Click volume routed via ' + providerName;
    byId('reroute-value').textContent = reroutePercent + '%';
    button.setAttribute('aria-pressed', String(isOutage));
    button.replaceChildren(
      document.createTextNode(isOutage ? 'Reset scenario' : 'Simulate outage'),
      element('span', '', isOutage ? '↺' : '↗'),
    );
    button.lastChild.setAttribute('aria-hidden', 'true');
    byId('reroute-controls').hidden = !isOutage;
    byId('scenario-summary').textContent = isOutage
      ? money(result.retainedUsd) + ' remains in the model under this assumption. Actual rerouting capacity is unknown.'
      : money(window.totalVolumeUsd) + ' observed across ' + rounded.format(window.totalSwaps) +
        ' swaps in this window. Choose a provider to test the exposure.';
    byId('scope-summary').textContent = window.rangeLabel + '. ' + money(result.withoutProviderUsd) +
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
  fillProviders('swapkit');
  render();
}

function setupReplay(snapshot) {
  const comparison = byId('benchmark');
  comparison.replaceChildren(...benchmarkOptions.map(({ id, name }) => new Option(name, id)));
  const history = replay(snapshot.replay).history;
  const maximum = Math.max(...history.map(({ volumeUsd }) => volumeUsd));
  byId('history').replaceChildren(...history.map((period) => {
    const column = element('div', 'history-column ' + period.kind);
    const bar = element('div', 'history-track');
    const barFill = element('span');
    barFill.style.height = percent(period.volumeUsd / maximum);
    bar.setAttribute('aria-hidden', 'true');
    bar.append(barFill);
    const label = element('div', 'history-label');
    label.append(element('span', '', period.label), element('strong', '', money(period.volumeUsd)));
    column.append(bar, label);
    return column;
  }));

  function render() {
    const benchmark = benchmarkOptions.find(({ id }) => id === comparison.value);
    const result = replay(snapshot.replay, benchmark.id);
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
}

start().catch((error) => {
  console.error(error);
  byId('snapshot-date').textContent = 'Snapshot unavailable';
  const alert = byId('load-error');
  alert.hidden = false;
  alert.textContent = 'Could not load the model. Serve the dist folder over HTTP and check that data/snapshot.json is present.';
});
