import { topojson } from "chartjs-chart-geo";
import type { Feature, FeatureCollection } from "geojson";
import type { Topology } from "topojson-specification";
import worldTopologyJson from "world-atlas/countries-110m.json";

const worldTopology = worldTopologyJson as unknown as Topology;

const landObject = worldTopology.objects.land;
const countriesObject = worldTopology.objects.countries;
if (!landObject || !countriesObject) {
  throw new Error("world-atlas/countries-110m: missing land or countries");
}

const landFc = topojson.feature(
  worldTopology,
  landObject,
) as unknown as FeatureCollection;
const landOutline = landFc.features[0];
if (!landOutline) {
  throw new Error("world-atlas/countries-110m: empty land feature collection");
}
export const WORLD_LAND_OUTLINE = landOutline;

const countriesFc = topojson.feature(
  worldTopology,
  countriesObject,
) as unknown as FeatureCollection;
export const WORLD_COUNTRY_FEATURES: Feature[] = countriesFc.features;
