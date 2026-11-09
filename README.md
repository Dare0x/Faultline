# Faultline

Faultline measures shared routing exposure on NEAR Intents and replays the October 1, 2026 service pause. It is a working prototype for the NEAR Hackathon Investment Thesis track.

**Thesis.** Adoption across many apps only strengthens the case for resilient Intents distribution to the extent that those apps have independent paths. Evidence that flow is widely distributed across separately operated providers, or that affected traffic moves to independent routes with little friction, would weaken the concentration concern.

## Review in two minutes

Requires Node.js 22 or newer. The bundled snapshot works offline. There is no install step.

```sh
node scripts/verify.mjs
node scripts/serve.mjs
```

Open `http://127.0.0.1:4173`. In the 30-day view, select **SwapKit** and click **Simulate outage**. Move the rerouting slider to 50% and compare the displaced volume with the zero-rerouting case. Select **View calculation** to see the full list of entries, the total observed volume, and how the share and scenario amount are calculated. Switch to the incident replay and compare **Previous week**, **Carry forward the decline**, and **Match Chainflip’s change**.

## Method

- **Routing.** The denominator is observed 1Click volume in the captured window. The numerator is the sum of per-app volume specifically attributed to the selected provider in NearStats’ `vias` field. An app’s other volume stays in the model. Entries without a routing attribution remain visible in the denominator and are treated as unknown. The windows overlap, and the 7-day and 30-day windows include the partial UTC capture day.
- **Scenario.** Displaced volume equals attributed provider volume multiplied by one minus the assumed rerouted share. Remaining modeled volume is observed volume minus displaced volume. The slider represents an assumption about how much flow can switch routes. Availability, slippage and spare capacity require separate evidence.
- **Replay.** DefiLlama’s daily NEAR Intents series is summed into matched Thursday–Sunday periods. The three reference values are the previous week's volume, that volume multiplied by the prior week-on-week ratio, and that volume multiplied by Chainflip's incident-week to prior-week ratio. Chainflip is a cross-chain comparator with its own market and operational risks. These are descriptive comparisons of aggregate volume. They cannot isolate the impact of the protocol pause or validate a hypothetical SwapKit outage.
- **Coverage.** The routing snapshot comes from the NearStats view of 1Click. The historical series has a different, protocol-wide scope. The current routing attribution cannot recover historical per-provider flow during the incident. The two denominators stay separate throughout the app.

## Data and reproduction

[NearStats Integrators](https://nearstats.org/integrators) provides routing attribution under CC BY 4.0. Faultline keeps only the input fields it uses and computes its own scenario. The incident series is an extract of the public [NEAR Intents](https://defillama.com/protocol/near-intents) and [Chainflip](https://defillama.com/protocol/chainflip) DefiLlama daily series. [NEAR Intents’ notice](https://x.com/near_intents/status/2105642219357241796) dates the pause.

`dist/data/snapshot.json` records the source URLs, capture timestamp and hashes of the fetched responses. `node scripts/verify.mjs` runs the same model used by the browser and checks totals, partial attribution, rerouting and replay arithmetic. To capture new public inputs, run `node scripts/capture.mjs` with network access, then run the verifier again. Refreshing the rolling routing windows will change their values.
