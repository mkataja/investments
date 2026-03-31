# Vanguard UK Professional (GPX)

**HTTPS** product page on **`www.vanguard.co.uk`**, path **`/professional/product/{etf|fund|mf}/…/{portId}/…`**. Holdings from **`POST https://www.vanguard.co.uk/gpx/graphql`** with **`x-consumer-id: uk2`**. **`parseVanguardUkProfessionalHoldingsPortId`** in **`@investments/db`**. Distribution source key **`vanguard_uk_gpx`**; fetch/parse **`api/src/distributions/fetchVanguardUkGpxHoldings.ts`**, **`parseVanguardUkGpxHoldings.ts`**.

See [Provider holdings overview](../data-sources.md#provider-holdings-overview) for URL validation and caches.
