# Vanguard UK Professional (GPX)

HTTPS product page `www.vanguard.co.uk/professional/product/{etf|fund|mf}/…/{portId}/…`. Holdings: `POST https://www.vanguard.co.uk/gpx/graphql` with `x-consumer-id: uk2`. `parseVanguardUkProfessionalHoldingsPortId` in `@investments/lib`. Source key `vanguard_uk_gpx`; fetch/parse `api/src/distributions/fetchVanguardUkGpxHoldings.ts`, `parseVanguardUkGpxHoldings.ts`.

[Provider holdings overview](../data-sources.md#provider-holdings-overview).
