import type { IncomingMessage, ServerResponse } from 'http';
import { createDomainGateway, serverOptions } from '../server/gateway';
import type { RouteDescriptor } from '../server/router';

import { createAviationServiceRoutes } from '../src/generated/server/worldmonitor/aviation/v1/service_server';
import { aviationHandler } from '../server/worldmonitor/aviation/v1/handler';
import { createClimateServiceRoutes } from '../src/generated/server/worldmonitor/climate/v1/service_server';
import { climateHandler } from '../server/worldmonitor/climate/v1/handler';
import { createConflictServiceRoutes } from '../src/generated/server/worldmonitor/conflict/v1/service_server';
import { conflictHandler } from '../server/worldmonitor/conflict/v1/handler';
import { createCyberServiceRoutes } from '../src/generated/server/worldmonitor/cyber/v1/service_server';
import { cyberHandler } from '../server/worldmonitor/cyber/v1/handler';
import { createDisplacementServiceRoutes } from '../src/generated/server/worldmonitor/displacement/v1/service_server';
import { displacementHandler } from '../server/worldmonitor/displacement/v1/handler';
import { createEconomicServiceRoutes } from '../src/generated/server/worldmonitor/economic/v1/service_server';
import { economicHandler } from '../server/worldmonitor/economic/v1/handler';
import { createGivingServiceRoutes } from '../src/generated/server/worldmonitor/giving/v1/service_server';
import { givingHandler } from '../server/worldmonitor/giving/v1/handler';
import { createInfrastructureServiceRoutes } from '../src/generated/server/worldmonitor/infrastructure/v1/service_server';
import { infrastructureHandler } from '../server/worldmonitor/infrastructure/v1/handler';
import { createIntelligenceServiceRoutes } from '../src/generated/server/worldmonitor/intelligence/v1/service_server';
import { intelligenceHandler } from '../server/worldmonitor/intelligence/v1/handler';
import { createMaritimeServiceRoutes } from '../src/generated/server/worldmonitor/maritime/v1/service_server';
import { maritimeHandler } from '../server/worldmonitor/maritime/v1/handler';
import { createMarketServiceRoutes } from '../src/generated/server/worldmonitor/market/v1/service_server';
import { marketHandler } from '../server/worldmonitor/market/v1/handler';
import { createMilitaryServiceRoutes } from '../src/generated/server/worldmonitor/military/v1/service_server';
import { militaryHandler } from '../server/worldmonitor/military/v1/handler';
import { createNewsServiceRoutes } from '../src/generated/server/worldmonitor/news/v1/service_server';
import { newsHandler } from '../server/worldmonitor/news/v1/handler';
import { createPositiveEventsServiceRoutes } from '../src/generated/server/worldmonitor/positive_events/v1/service_server';
import { positiveEventsHandler } from '../server/worldmonitor/positive-events/v1/handler';
import { createPredictionServiceRoutes } from '../src/generated/server/worldmonitor/prediction/v1/service_server';
import { predictionHandler } from '../server/worldmonitor/prediction/v1/handler';
import { createResearchServiceRoutes } from '../src/generated/server/worldmonitor/research/v1/service_server';
import { researchHandler } from '../server/worldmonitor/research/v1/handler';
import { createSeismologyServiceRoutes } from '../src/generated/server/worldmonitor/seismology/v1/service_server';
import { seismologyHandler } from '../server/worldmonitor/seismology/v1/handler';
import { createSupplyChainServiceRoutes } from '../src/generated/server/worldmonitor/supply_chain/v1/service_server';
import { supplyChainHandler } from '../server/worldmonitor/supply-chain/v1/handler';
import { createTradeServiceRoutes } from '../src/generated/server/worldmonitor/trade/v1/service_server';
import { tradeHandler } from '../server/worldmonitor/trade/v1/handler';
import { createUnrestServiceRoutes } from '../src/generated/server/worldmonitor/unrest/v1/service_server';
import { unrestHandler } from '../server/worldmonitor/unrest/v1/handler';
import { createWildfireServiceRoutes } from '../src/generated/server/worldmonitor/wildfire/v1/service_server';
import { wildfireHandler } from '../server/worldmonitor/wildfire/v1/handler';

const allRoutes: RouteDescriptor[] = [
  ...createAviationServiceRoutes(aviationHandler, serverOptions),
  ...createClimateServiceRoutes(climateHandler, serverOptions),
  ...createConflictServiceRoutes(conflictHandler, serverOptions),
  ...createCyberServiceRoutes(cyberHandler, serverOptions),
  ...createDisplacementServiceRoutes(displacementHandler, serverOptions),
  ...createEconomicServiceRoutes(economicHandler, serverOptions),
  ...createGivingServiceRoutes(givingHandler, serverOptions),
  ...createInfrastructureServiceRoutes(infrastructureHandler, serverOptions),
  ...createIntelligenceServiceRoutes(intelligenceHandler, serverOptions),
  ...createMaritimeServiceRoutes(maritimeHandler, serverOptions),
  ...createMarketServiceRoutes(marketHandler, serverOptions),
  ...createMilitaryServiceRoutes(militaryHandler, serverOptions),
  ...createNewsServiceRoutes(newsHandler, serverOptions),
  ...createPositiveEventsServiceRoutes(positiveEventsHandler, serverOptions),
  ...createPredictionServiceRoutes(predictionHandler, serverOptions),
  ...createResearchServiceRoutes(researchHandler, serverOptions),
  ...createSeismologyServiceRoutes(seismologyHandler, serverOptions),
  ...createSupplyChainServiceRoutes(supplyChainHandler, serverOptions),
  ...createTradeServiceRoutes(tradeHandler, serverOptions),
  ...createUnrestServiceRoutes(unrestHandler, serverOptions),
  ...createWildfireServiceRoutes(wildfireHandler, serverOptions),
];

const gateway = createDomainGateway(allRoutes);

function toWebRequest(req: IncomingMessage): Request {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = req.headers.host || 'localhost';
  const url = `${proto}://${host}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  return new Request(url, { method: req.method, headers });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const webReq = toWebRequest(req);
  try {
    const response = await gateway(webReq);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const body = await response.arrayBuffer();
    res.end(Buffer.from(body));
  } catch (err) {
    console.error('[gateway] handler error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}
