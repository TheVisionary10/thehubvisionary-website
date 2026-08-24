/**
 * lib/fees.js — distance-based callout fee estimator.
 *
 * A documented cost model, not a guess:
 *   1. Fuel — round-trip distance × consumption × current pump price.
 *   2. Vehicle wear & tear — a flat % on top of fuel (servicing, tyres,
 *      depreciation amortized over trips).
 *   3. Technician time-in-transit — travel isn't billable repair time,
 *      but it isn't free either; a modest per-km rate covers it.
 *   4. Margin — a profit margin on top of steps 1–3, so a callout is
 *      never priced at break-even.
 *
 * Inputs used (update these as conditions change):
 *   - Fuel price: KSh 214.03/litre, Nairobi Super Petrol — EPRA pricing
 *     cycle effective 15 Aug – 14 Sep 2026 (epra.go.ke).
 *   - Consumption: 10 L/100km — a reasonable mixed-driving planning
 *     figure; adjust FUEL_CONSUMPTION_L_PER_100KM if the actual vehicle
 *     used for callouts differs.
 *
 * Past ~550km, driving stops being the realistic option, so the model
 * switches from a per-km formula to fixed remote-tier bands that assume
 * flights and accommodation are likely — deliberately wide "starting
 * guide" ranges, finalized on a scoping call rather than computed per-km.
 */
const { readJSON, FILES } = require("./store");

const FUEL_PRICE_PER_LITRE = 214.03;
const FUEL_CONSUMPTION_L_PER_100KM = 10;
const WEAR_AND_TEAR_MULTIPLIER = 1.15;
const TIME_IN_TRANSIT_KSH_PER_KM = 18;
const CALLOUT_MARGIN_MULTIPLIER = 1.25;

function calloutFeeForDistance(km) {
  if (km <= 15) {
    return { fee: "Included in standard callout fee", accommodation: false, note: "" };
  }

  if (km <= 550) {
    const fuelCostRoundTrip = 2 * km * (FUEL_CONSUMPTION_L_PER_100KM / 100) * FUEL_PRICE_PER_LITRE;
    const withWear = fuelCostRoundTrip * WEAR_AND_TEAR_MULTIPLIER;
    const withTime = withWear + km * TIME_IN_TRANSIT_KSH_PER_KM;
    const sellPrice = withTime * CALLOUT_MARGIN_MULTIPLIER;

    const low = Math.round((sellPrice * 0.9) / 500) * 500;
    const high = Math.round((sellPrice * 1.15) / 500) * 500;

    return {
      fee: `KSh ${low.toLocaleString()} – ${high.toLocaleString()}`,
      feeLow: low,
      feeHigh: high,
      accommodation: km > 250,
      note: km > 250 ? "Overnight accommodation may apply depending on job duration." : "",
    };
  }

  if (km <= 750) {
    return {
      fee: "KSh 42,000 – 58,000",
      feeLow: 42000,
      feeHigh: 58000,
      accommodation: true,
      note: "Accommodation required; flights may be used depending on the destination. Final fee confirmed after a scoping call.",
    };
  }

  return {
    fee: "KSh 58,000+ (custom quote)",
    feeLow: 58000,
    feeHigh: null,
    accommodation: true,
    note: "Flights and accommodation typically required for this distance. Final fee confirmed after a scoping call.",
  };
}

function countiesWithFees() {
  const counties = readJSON(FILES.counties, []);
  return counties
    .map((c) => ({ ...c, ...calloutFeeForDistance(c.distanceKm) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { calloutFeeForDistance, countiesWithFees };
