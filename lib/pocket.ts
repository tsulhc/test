import { cache } from "react";

import { getCachedSettlementBlocks, getMeta, saveSettlementBlock, setMeta } from "@/lib/db";
import { PROVIDER_DOMAIN_LABEL_OVERRIDES, SUPPLIER_PROVIDER_OVERRIDES } from "@/lib/provider-overrides";
import type {
  DashboardData,
  ProviderStats,
  ServiceMap,
  ServiceStats,
  SupplierDirectory,
  SupplierDirectoryEntry,
  SupplierMember,
  TimeWindow
} from "@/lib/types";

type RpcEvent = {
  type: string;
  attributes: Array<{
    key: string;
    value: string;
    index: boolean;
  }>;
};

type StatusResponse = {
  result?: {
    sync_info?: {
      latest_block_height?: string;
    };
  };
};

type BlockSearchResponse = {
  result?: {
    blocks?: Array<{
      block?: {
        header?: {
          height?: string;
          time?: string;
        };
      };
    }>;
  };
};

type CoinGeckoPriceResponse = {
  "pocket-network"?: {
    usd?: number;
  };
};

type PoktscanMetadataResponse = {
  data?: {
    status?: {
      lastProcessedHeight?: number | null;
      targetHeight?: number | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

type PoktscanDomainRewardsResponse = {
  data?: {
    status?: {
      lastProcessedHeight?: number | null;
      targetHeight?: number | null;
    } | null;
    rewards?: {
      groupedAggregates?: Array<{
        keys?: string[] | null;
        sum?: {
          grossRewards?: string | number | null;
          relays?: string | number | null;
        } | null;
      }> | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

type PoktscanSuppliersResponse = {
  data?: {
    suppliers?: {
      nodes?: Array<{
        id: string;
        ownerId: string;
        operatorId: string;
        serviceConfigs?: {
          nodes?: Array<{
            domains?: string[] | null;
            endpoints?: Array<{ url?: string | null }> | null;
          }> | null;
        } | null;
      } | null> | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

type PoktscanSupplierNode = {
  id: string;
  ownerId: string;
  operatorId: string;
  serviceConfigs?: {
    nodes?: Array<{
      domains?: string[] | null;
      endpoints?: Array<{ url?: string | null }> | null;
    } | null> | null;
  } | null;
};

type ProviderAggregateRow = {
  providerKey: string;
  providerLabel: string;
  providerDomain: string;
  serviceId: string;
  serviceName: string;
  relays: number;
  revenueUpokt: bigint;
};

type ServicesResponse = {
  service?: Array<{
    id: string;
    name: string;
  }>;
  pagination?: {
    next_key?: string | null;
  };
};

type SuppliersResponse = {
  supplier?: Array<{
    owner_address: string;
    operator_address: string;
    services?: Array<{
      endpoints?: Array<{
        url: string;
      }>;
    }>;
  }>;
  pagination?: {
    next_key?: string | null;
  };
};

type RewardDistributionDetail = {
  recipient_address: string;
  op_reason: string;
  amount: string;
};

type SettlementEvent = {
  blockHeight: number;
  blockTime: string;
  serviceId: string;
  serviceName: string;
  supplierOperatorAddress: string;
  supplierOwnerAddress: string;
  numRelays: number;
  supplierRevenueUpokt: bigint;
};

const DEFAULT_RPC_URLS = [
  "https://sauron-rpc.infra.pocket.network",
  "https://pocket-rpc.polkachu.com:443",
  "https://rpc.pocket.chaintools.tech:443",
  "https://pocket.api.pocket.network:443"
];

const DEFAULT_RPC_URL = process.env.POCKET_RPC_URL ?? DEFAULT_RPC_URLS[0];
const DEFAULT_REST_URL = process.env.POCKET_REST_URL ?? "https://sauron-api.infra.pocket.network";
const DEFAULT_POKTSCAN_URL = process.env.POKTSCAN_API_URL ?? "https://api.poktscan.com/";
const RPC_URLS = Array.from(
  new Set(
    (process.env.POCKET_RPC_URLS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .concat(process.env.POCKET_RPC_URL ? [process.env.POCKET_RPC_URL] : [])
      .concat(DEFAULT_RPC_URLS)
  )
);

const SERVICES_PATH = "/pokt-network/poktroll/service/service";
const SUPPLIERS_PATH = "/pokt-network/poktroll/supplier/supplier";
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RPC_TIMEOUT_MS = 5_000;
const BLOCK_RESULTS_TIMEOUT_MS = 8_000;
const SETTLEMENT_EVENT_TYPE = "pocket.tokenomics.EventClaimSettled";
const SETTLEMENT_MODE_QUERY = "pocket.tokenomics.EventClaimSettled.mode='EndBlock'";
const SUPPLIER_REWARD_REASONS = new Set([
  "TLM_RELAY_BURN_EQUALS_MINT_SUPPLIER_SHAREHOLDER_REWARD_DISTRIBUTION",
  "TLM_GLOBAL_MINT_SUPPLIER_SHAREHOLDER_REWARD_DISTRIBUTION"
]);
const SECOND_LEVEL_SUFFIXES = new Set(["co.uk", "org.uk", "com.au", "net.au", "co.jp", "com.br"]);

const SAMPLE_BLOCKS_PER_WINDOW: Record<TimeWindow, number> = {
  "24h": 36,
  "7d": 72,
  "30d": 144
};

const dashboardCache = new Map<TimeWindow, { expiresAt: number; data: DashboardData }>();
let priceCache: { value: number; expiresAt: number } | null = null;

function buildRpcUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function getRpcCandidates(seed = 0): string[] {
  if (RPC_URLS.length <= 1) {
    return RPC_URLS;
  }

  const normalizedSeed = Math.abs(seed) % RPC_URLS.length;
  return [...RPC_URLS.slice(normalizedSeed), ...RPC_URLS.slice(0, normalizedSeed)];
}

async function fetchFromRpc<T>(rpcUrl: string, path: string, timeoutMs = DEFAULT_RPC_TIMEOUT_MS): Promise<T> {
  const response = await fetch(buildRpcUrl(rpcUrl, path), {
    headers: {
      accept: "application/json"
    },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${rpcUrl}${path}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function fetchJsonFromRpcPool<T>(path: string, options?: { seed?: number; timeoutMs?: number; parallel?: boolean }): Promise<T> {
  const candidates = getRpcCandidates(options?.seed ?? 0);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;

  if (options?.parallel !== false) {
    try {
      return await Promise.any(candidates.map((rpcUrl) => fetchFromRpc<T>(rpcUrl, path, timeoutMs)));
    } catch {
      // Fall through to sequential retry so we can surface the last meaningful error.
    }
  }

  let lastError: unknown;
  for (const rpcUrl of candidates) {
    try {
      return await fetchFromRpc<T>(rpcUrl, path, timeoutMs);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`All RPC requests failed for path ${path}`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function fetchPoktscan<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(DEFAULT_POKTSCAN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${DEFAULT_POKTSCAN_URL}: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as { errors?: Array<{ message: string }> } & T;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  return payload;
}

async function getPoktPriceUsd(): Promise<number> {
  if (priceCache && priceCache.expiresAt > Date.now()) {
    return priceCache.value;
  }

  const cachedMeta = getMeta("pokt_price_usd");
  if (cachedMeta) {
    try {
      const parsed = JSON.parse(cachedMeta) as { value: number; updatedAt: string };
      if (Date.now() - new Date(parsed.updatedAt).getTime() < CACHE_TTL_MS) {
        priceCache = { value: parsed.value, expiresAt: Date.now() + CACHE_TTL_MS };
        return parsed.value;
      }
    } catch {
      // Ignore invalid cached price payload.
    }
  }

  try {
    const response = await fetchJson<CoinGeckoPriceResponse>(
      "https://api.coingecko.com/api/v3/simple/price?ids=pocket-network&vs_currencies=usd"
    );
    const value = response["pocket-network"]?.usd ?? 0;

    priceCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    setMeta("pokt_price_usd", JSON.stringify({ value, updatedAt: new Date().toISOString() }));
    return value;
  } catch {
    if (cachedMeta) {
      try {
        const parsed = JSON.parse(cachedMeta) as { value: number };
        return parsed.value;
      } catch {
        return 0;
      }
    }

    return 0;
  }
}

async function extractFinalizeBlockEventsFromRpc(rpcUrl: string, path: string): Promise<RpcEvent[]> {
  const response = await fetch(buildRpcUrl(rpcUrl, path), {
    headers: {
      accept: "application/json"
    },
    cache: "no-store",
    signal: AbortSignal.timeout(BLOCK_RESULTS_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${rpcUrl}${path}: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error(`Readable stream missing for ${rpcUrl}${path}`);
  }

  const marker = '"finalize_block_events":';
  const decoder = new TextDecoder();
  const reader = response.body.getReader();

  let buffer = "";
  let started = false;
  let arrayStarted = false;
  let captured = "";
  let depth = 0;
  let inString = false;
  let escaped = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    if (!started) {
      const markerIndex = buffer.indexOf(marker);
      if (markerIndex === -1) {
        buffer = buffer.slice(Math.max(0, buffer.length - marker.length));
        continue;
      }

      started = true;
      buffer = buffer.slice(markerIndex + marker.length);
    }

    for (let index = 0; index < buffer.length; index += 1) {
      const char = buffer[index];

      if (!arrayStarted) {
        if (char === "[") {
          arrayStarted = true;
          depth = 1;
          captured = "[";
        }
        continue;
      }

      captured += char;

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "[") depth += 1;
      if (char === "]") depth -= 1;

      if (depth === 0) {
        return JSON.parse(captured) as RpcEvent[];
      }
    }

    buffer = arrayStarted ? "" : buffer;
  }

  throw new Error(`Unable to extract finalize_block_events from ${rpcUrl}${path}`);
}

async function extractFinalizeBlockEventsFromRpcPool(path: string, seed: number): Promise<RpcEvent[]> {
  const candidates = getRpcCandidates(seed);
  let lastError: unknown;

  for (const rpcUrl of candidates) {
    try {
      return await extractFinalizeBlockEventsFromRpc(rpcUrl, path);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`All RPC block_results requests failed for path ${path}`);
}

async function mapConcurrent<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const current = cursor;
      cursor += 1;
      results[current] = await worker(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

function normalizeAttributeValue(value: string): string {
  if (value.startsWith("\"") && value.endsWith("\"")) {
    return JSON.parse(value) as string;
  }

  return value;
}

function parseUpokt(value: string): bigint {
  const normalized = normalizeAttributeValue(value);
  const match = normalized.match(/^(-?\d+)upokt$/);

  if (!match) {
    throw new Error(`Unexpected coin value: ${value}`);
  }

  return BigInt(match[1]);
}

function parseInteger(value: string): number {
  return Number(normalizeAttributeValue(value));
}

function buildAttributeMap(event: RpcEvent): Record<string, string> {
  return Object.fromEntries(event.attributes.map((attribute) => [attribute.key, attribute.value]));
}

function toTitleCase(input: string): string {
  return input
    .split(/[-.]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getProviderLabel(providerKey: string): string {
  return PROVIDER_DOMAIN_LABEL_OVERRIDES[providerKey] ?? toTitleCase(providerKey.split(".")[0] ?? providerKey);
}

function getHostname(url: string): string | null {
  const normalized = url.includes("://") ? url : `https://${url}`;

  try {
    return new URL(normalized).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function isIpv4(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function getRegistrableDomain(hostname: string): string {
  if (hostname === "localhost" || isIpv4(hostname)) {
    return hostname;
  }

  const labels = hostname.split(".").filter(Boolean);
  if (labels.length <= 2) {
    return hostname;
  }

  const suffix = labels.slice(-2).join(".");
  if (SECOND_LEVEL_SUFFIXES.has(suffix) && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }

  return labels.slice(-2).join(".");
}

function deriveProviderIdentity(operatorAddress: string, ownerAddress: string, endpointUrls: string[]): SupplierDirectoryEntry {
  const override = SUPPLIER_PROVIDER_OVERRIDES[operatorAddress];
  if (override) {
    return {
      operatorAddress,
      ownerAddress,
      providerKey: override.providerKey,
      providerLabel: override.providerLabel ?? PROVIDER_DOMAIN_LABEL_OVERRIDES[override.providerKey] ?? override.providerKey,
      providerDomain: override.providerDomain ?? override.providerKey
    };
  }

  const domainFrequency = new Map<string, number>();
  for (const endpointUrl of endpointUrls) {
    const hostname = getHostname(endpointUrl);
    if (!hostname) continue;
    const domain = getRegistrableDomain(hostname);
    domainFrequency.set(domain, (domainFrequency.get(domain) ?? 0) + 1);
  }

  const topDomain = Array.from(domainFrequency.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (topDomain) {
    return {
      operatorAddress,
      ownerAddress,
      providerKey: topDomain,
      providerLabel: getProviderLabel(topDomain),
      providerDomain: topDomain
    };
  }

  return {
    operatorAddress,
    ownerAddress,
    providerKey: `owner:${ownerAddress}`,
    providerLabel: `Owner ${ownerAddress.slice(0, 8)}`,
    providerDomain: ownerAddress
  };
}

function getWindowStart(window: TimeWindow): Date {
  const now = Date.now();

  switch (window) {
    case "24h":
      return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now - 30 * 24 * 60 * 60 * 1000);
  }
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseNumeric(value: string | number | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function parseNumericBigInt(value: string | number | null | undefined): bigint {
  if (value == null) return 0n;
  if (typeof value === "number") {
    return BigInt(Math.trunc(value));
  }

  const normalized = value.includes(".") ? value.split(".")[0] ?? "0" : value;
  return BigInt(normalized || "0");
}

async function getStatus(): Promise<{ latestHeight: number }> {
  const data = await fetchJsonFromRpcPool<StatusResponse>("/status", { parallel: true, timeoutMs: DEFAULT_RPC_TIMEOUT_MS });
  const latestHeight = Number(data.result?.sync_info?.latest_block_height ?? 0);

  if (!latestHeight) {
    throw new Error("Unable to read latest block height from Pocket RPC status");
  }

  return { latestHeight };
}

const getServiceMap = cache(async (): Promise<ServiceMap> => {
  const services: ServiceMap = {};
  let nextKey = "";

  while (true) {
    const search = new URLSearchParams({
      dehydrated: "true",
      "pagination.limit": "250"
    });

    if (nextKey) {
      search.set("pagination.key", nextKey);
    }

    const response = await fetchJson<ServicesResponse>(`${DEFAULT_REST_URL}${SERVICES_PATH}?${search.toString()}`);

    for (const service of response.service ?? []) {
      services[service.id] = { name: service.name || service.id };
    }

    nextKey = response.pagination?.next_key ?? "";
    if (!nextKey) break;
  }

  return services;
});

const getSupplierDirectory = cache(async (): Promise<SupplierDirectory> => {
  const directory: SupplierDirectory = {};
  let nextKey = "";

  while (true) {
    const search = new URLSearchParams({
      dehydrated: "false",
      "pagination.limit": "200"
    });

    if (nextKey) {
      search.set("pagination.key", nextKey);
    }

    const response = await fetchJson<SuppliersResponse>(`${DEFAULT_REST_URL}${SUPPLIERS_PATH}?${search.toString()}`);

    for (const supplier of response.supplier ?? []) {
      const endpointUrls = (supplier.services ?? []).flatMap((service) => (service.endpoints ?? []).map((endpoint) => endpoint.url));
      directory[supplier.operator_address] = deriveProviderIdentity(
        supplier.operator_address,
        supplier.owner_address,
        endpointUrls
      );
    }

    nextKey = response.pagination?.next_key ?? "";
    if (!nextKey) break;
  }

  return directory;
});

const getPoktscanSupplierDirectory = cache(async (): Promise<SupplierDirectory> => {
  const directory: SupplierDirectory = {};
  let offset = 0;

  while (true) {
    const response = await fetchPoktscan<PoktscanSuppliersResponse>(
      `query PoktscanSuppliers($offset: Int!) {
        suppliers(first: 200, offset: $offset) {
          nodes {
            id
            ownerId
            operatorId
            serviceConfigs(first: 100) {
              nodes {
                domains
                endpoints
              }
            }
          }
        }
      }`,
      { offset }
    );

    const nodes = response.data?.suppliers?.nodes ?? [];
    if (nodes.length === 0) {
      break;
    }

    for (const supplier of nodes) {
      if (!supplier) continue;

      const domains = (supplier.serviceConfigs?.nodes ?? []).flatMap((config) => config?.domains ?? []);
      const endpointUrls = (supplier.serviceConfigs?.nodes ?? []).flatMap((config) =>
        (config?.endpoints ?? []).flatMap((endpoint) => (endpoint?.url ? [endpoint.url] : []))
      );
      const uniqueDomains = Array.from(
        new Set(domains.filter((domain): domain is string => Boolean(domain)).map((domain) => domain.toLowerCase()))
      );

      if (uniqueDomains.length > 0) {
        const providerKey = uniqueDomains[0];
        directory[supplier.operatorId] = {
          operatorAddress: supplier.operatorId,
          ownerAddress: supplier.ownerId,
          providerKey,
          providerLabel: getProviderLabel(providerKey),
          providerDomain: providerKey
        };
        continue;
      }

      directory[supplier.operatorId] = deriveProviderIdentity(supplier.operatorId, supplier.ownerId, endpointUrls);
    }

    offset += nodes.length;
  }

  return directory;
});

async function getFinalizeEvents(height: number): Promise<RpcEvent[]> {
  return extractFinalizeBlockEventsFromRpcPool(`/block_results?height=${height}`, height);
}

async function getRecentSettlementBlocks(limit: number): Promise<Array<{ height: number; time: string }>> {
  const blocks: Array<{ height: number; time: string }> = [];
  let page = 1;

  while (blocks.length < limit) {
    const search = new URLSearchParams({
      query: `"${SETTLEMENT_MODE_QUERY}"`,
      page: String(page),
      per_page: "50",
      order_by: '"desc"'
    });

    const response = await fetchJsonFromRpcPool<BlockSearchResponse>(`/block_search?${search.toString()}`, {
      seed: page,
      timeoutMs: DEFAULT_RPC_TIMEOUT_MS,
      parallel: true
    });
    const pageBlocks = response.result?.blocks ?? [];

    if (pageBlocks.length === 0) {
      break;
    }

    for (const entry of pageBlocks) {
      const height = Number(entry.block?.header?.height ?? 0);
      const time = entry.block?.header?.time ?? "";
      if (!height || !time) continue;
      blocks.push({ height, time });
      if (blocks.length >= limit) break;
    }

    page += 1;
  }

  return blocks;
}

function parseSettlementEvent(event: RpcEvent, blockHeight: number, blockTime: string, serviceMap: ServiceMap): SettlementEvent {
  const attributes = buildAttributeMap(event);
  const serviceId = normalizeAttributeValue(attributes.service_id);
  const rewardDetails = JSON.parse(attributes.reward_distribution_detailed) as RewardDistributionDetail[];
  const supplierRevenueUpokt = rewardDetails.reduce((sum, detail) => {
    if (!SUPPLIER_REWARD_REASONS.has(detail.op_reason)) return sum;
    return sum + parseUpokt(detail.amount);
  }, 0n);

  return {
    blockHeight,
    blockTime,
    serviceId,
    serviceName: serviceMap[serviceId]?.name ?? serviceId,
    supplierOperatorAddress: normalizeAttributeValue(attributes.supplier_operator_address),
    supplierOwnerAddress: normalizeAttributeValue(attributes.supplier_owner_address),
    numRelays: parseInteger(attributes.num_relays),
    supplierRevenueUpokt
  };
}

function buildDashboardFromProviderRows(
  window: TimeWindow,
  latestHeight: number,
  rows: ProviderAggregateRow[],
  supplierDirectory: SupplierDirectory,
  poktPriceUsd: number,
  options?: {
    dataSource?: "poktscan" | "rpc";
    indexerProcessedHeight?: number;
    indexerTargetHeight?: number;
    earliestSettlementTime?: string | null;
    latestSettlementTime?: string | null;
  }
): DashboardData {
  const providerMap = new Map<string, ProviderStats>();
  const serviceMap = new Map<string, ServiceStats>();
  let totalRelays = 0;
  let totalRevenueUpokt = 0n;

  for (const row of rows) {
    totalRelays += row.relays;
    totalRevenueUpokt += row.revenueUpokt;

    const provider = providerMap.get(row.providerKey) ?? {
      providerKey: row.providerKey,
      providerLabel: row.providerLabel,
      providerDomain: row.providerDomain,
      relays: 0,
      revenueUpokt: 0n,
      chainCount: 0,
      supplierCount: 0,
      suppliers: [],
      chains: []
    };

    provider.relays += row.relays;
    provider.revenueUpokt += row.revenueUpokt;

    let chain = provider.chains.find((entry) => entry.serviceId === row.serviceId);
    if (!chain) {
      chain = {
        serviceId: row.serviceId,
        serviceName: row.serviceName,
        relays: 0,
        revenueUpokt: 0n
      };
      provider.chains.push(chain);
    }

    chain.relays += row.relays;
    chain.revenueUpokt += row.revenueUpokt;
    provider.chainCount = provider.chains.length;
    providerMap.set(row.providerKey, provider);

    const service = serviceMap.get(row.serviceId) ?? {
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      relays: 0,
      revenueUpokt: 0n,
      providerCount: 0
    };

    service.relays += row.relays;
    service.revenueUpokt += row.revenueUpokt;
    serviceMap.set(row.serviceId, service);
  }

  for (const supplier of Object.values(supplierDirectory)) {
    const provider = providerMap.get(supplier.providerKey);
    if (!provider) continue;

    provider.suppliers.push({
      operatorAddress: supplier.operatorAddress,
      ownerAddress: supplier.ownerAddress,
      domain: supplier.providerDomain
    });
    provider.supplierCount = provider.suppliers.length;
  }

  const providers = Array.from(providerMap.values())
    .map((provider) => ({
      ...provider,
      suppliers: provider.suppliers.sort((a, b) => a.operatorAddress.localeCompare(b.operatorAddress)),
      chains: provider.chains.sort((a, b) =>
        b.revenueUpokt === a.revenueUpokt ? b.relays - a.relays : b.revenueUpokt > a.revenueUpokt ? 1 : -1
      )
    }))
    .sort((a, b) => (b.revenueUpokt === a.revenueUpokt ? b.relays - a.relays : b.revenueUpokt > a.revenueUpokt ? 1 : -1));

  for (const service of serviceMap.values()) {
    service.providerCount = providers.filter((provider) => provider.chains.some((chain) => chain.serviceId === service.serviceId)).length;
  }

  const services = Array.from(serviceMap.values()).sort((a, b) =>
    b.revenueUpokt === a.revenueUpokt ? b.relays - a.relays : b.revenueUpokt > a.revenueUpokt ? 1 : -1
  );

  return {
    window,
    generatedAt: new Date().toISOString(),
    dataSource: options?.dataSource ?? "rpc",
    poktPriceUsd,
    latestHeight,
    indexerProcessedHeight: options?.indexerProcessedHeight,
    indexerTargetHeight: options?.indexerTargetHeight,
    scannedHeights: 0,
    scannedSettlementHeights: 0,
    settlementEvents: 0,
    earliestSettlementTime: options?.earliestSettlementTime ?? null,
    latestSettlementTime: options?.latestSettlementTime ?? null,
    totalRelays,
    totalRevenueUpokt,
    activeProviders: providers.length,
    activeChains: services.length,
    providers,
    services
  };
}

function buildDashboard(
  window: TimeWindow,
  latestHeight: number,
  settlements: SettlementEvent[],
  supplierDirectory: SupplierDirectory,
  poktPriceUsd: number
): DashboardData {
  const providerMap = new Map<string, ProviderStats>();
  const serviceMap = new Map<string, ServiceStats>();
  let totalRelays = 0;
  let totalRevenueUpokt = 0n;

  for (const settlement of settlements) {
    totalRelays += settlement.numRelays;
    totalRevenueUpokt += settlement.supplierRevenueUpokt;

    const supplierInfo = supplierDirectory[settlement.supplierOperatorAddress] ?? {
      operatorAddress: settlement.supplierOperatorAddress,
      ownerAddress: settlement.supplierOwnerAddress,
      providerKey: `owner:${settlement.supplierOwnerAddress}`,
      providerLabel: `Owner ${settlement.supplierOwnerAddress.slice(0, 8)}`,
      providerDomain: settlement.supplierOwnerAddress
    };

    const provider = providerMap.get(supplierInfo.providerKey) ?? {
      providerKey: supplierInfo.providerKey,
      providerLabel: supplierInfo.providerLabel,
      providerDomain: supplierInfo.providerDomain,
      relays: 0,
      revenueUpokt: 0n,
      chainCount: 0,
      supplierCount: 0,
      suppliers: [],
      chains: []
    };

    provider.relays += settlement.numRelays;
    provider.revenueUpokt += settlement.supplierRevenueUpokt;

    if (!provider.suppliers.some((supplier) => supplier.operatorAddress === settlement.supplierOperatorAddress)) {
      provider.suppliers.push({
        operatorAddress: settlement.supplierOperatorAddress,
        ownerAddress: settlement.supplierOwnerAddress,
        domain: supplierInfo.providerDomain
      });
      provider.supplierCount = provider.suppliers.length;
    }

    let chain = provider.chains.find((entry) => entry.serviceId === settlement.serviceId);
    if (!chain) {
      chain = {
        serviceId: settlement.serviceId,
        serviceName: settlement.serviceName,
        relays: 0,
        revenueUpokt: 0n
      };
      provider.chains.push(chain);
    }

    chain.relays += settlement.numRelays;
    chain.revenueUpokt += settlement.supplierRevenueUpokt;
    provider.chainCount = provider.chains.length;
    providerMap.set(supplierInfo.providerKey, provider);

    const service = serviceMap.get(settlement.serviceId) ?? {
      serviceId: settlement.serviceId,
      serviceName: settlement.serviceName,
      relays: 0,
      revenueUpokt: 0n,
      providerCount: 0
    };

    service.relays += settlement.numRelays;
    service.revenueUpokt += settlement.supplierRevenueUpokt;
    serviceMap.set(settlement.serviceId, service);
  }

  const providers = Array.from(providerMap.values())
    .map((provider) => ({
      ...provider,
      suppliers: provider.suppliers.sort((a, b) => a.operatorAddress.localeCompare(b.operatorAddress)),
      chains: provider.chains.sort((a, b) =>
        b.revenueUpokt === a.revenueUpokt ? b.relays - a.relays : b.revenueUpokt > a.revenueUpokt ? 1 : -1
      )
    }))
    .sort((a, b) => (b.revenueUpokt === a.revenueUpokt ? b.relays - a.relays : b.revenueUpokt > a.revenueUpokt ? 1 : -1));

  for (const service of serviceMap.values()) {
    service.providerCount = providers.filter((provider) => provider.chains.some((chain) => chain.serviceId === service.serviceId)).length;
  }

  const services = Array.from(serviceMap.values()).sort((a, b) =>
    b.revenueUpokt === a.revenueUpokt ? b.relays - a.relays : b.revenueUpokt > a.revenueUpokt ? 1 : -1
  );
  const settlementTimes = settlements.map((settlement) => settlement.blockTime).sort();

  return {
    window,
    generatedAt: new Date().toISOString(),
    dataSource: "rpc",
    poktPriceUsd,
    latestHeight,
    scannedHeights: 0,
    scannedSettlementHeights: 0,
    settlementEvents: settlements.length,
    earliestSettlementTime: settlementTimes[0] ?? null,
    latestSettlementTime: settlementTimes.at(-1) ?? null,
    totalRelays,
    totalRevenueUpokt,
    activeProviders: providers.length,
    activeChains: services.length,
    providers,
    services
  };
}

async function loadDashboardFromPoktscan(window: TimeWindow): Promise<DashboardData> {
  if (window === "24h") {
    throw new Error("Poktscan daily aggregates are not precise enough for 24h");
  }

  const start = getWindowStart(window);
  const end = new Date();
  const [serviceMap, supplierDirectory, poktPriceUsd, rewardsResponse] = await Promise.all([
    getServiceMap(),
    getPoktscanSupplierDirectory(),
    getPoktPriceUsd(),
    fetchPoktscan<PoktscanDomainRewardsResponse>(
      `query PoktscanDomainRewards($start: Date!, $end: Date!) {
        status: _metadata {
          lastProcessedHeight
          targetHeight
        }
        rewards: domainServiceDailyRewards(
          filter: {
            day: {
              greaterThanOrEqualTo: $start
              lessThanOrEqualTo: $end
            }
          }
        ) {
          groupedAggregates(groupBy: [DOMAIN, SERVICE_ID]) {
            keys
            sum {
              grossRewards
              relays
            }
          }
        }
      }`,
      {
        start: toIsoDate(start),
        end: toIsoDate(end)
      }
    )
  ]);

  const rows: ProviderAggregateRow[] = [];
  for (const aggregate of rewardsResponse.data?.rewards?.groupedAggregates ?? []) {
    const providerDomain = aggregate.keys?.[0];
    const serviceId = aggregate.keys?.[1];
    if (!providerDomain || !serviceId) continue;

    rows.push({
      providerKey: providerDomain,
      providerLabel: getProviderLabel(providerDomain),
      providerDomain,
      serviceId,
      serviceName: serviceMap[serviceId]?.name ?? serviceId,
      relays: parseNumeric(aggregate.sum?.relays),
      revenueUpokt: parseNumericBigInt(aggregate.sum?.grossRewards)
    });
  }

  const latestHeight = rewardsResponse.data?.status?.targetHeight ?? rewardsResponse.data?.status?.lastProcessedHeight ?? 0;
  return buildDashboardFromProviderRows(window, latestHeight, rows, supplierDirectory, poktPriceUsd, {
    dataSource: "poktscan",
    indexerProcessedHeight: rewardsResponse.data?.status?.lastProcessedHeight ?? undefined,
    indexerTargetHeight: rewardsResponse.data?.status?.targetHeight ?? undefined,
    earliestSettlementTime: start.toISOString(),
    latestSettlementTime: end.toISOString()
  });
}

async function loadDashboardFromRpc(window: TimeWindow): Promise<DashboardData> {
  const cached = dashboardCache.get(window);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const [{ latestHeight }, serviceMap, supplierDirectory, poktPriceUsd] = await Promise.all([
    getStatus(),
    getServiceMap(),
    getSupplierDirectory(),
    getPoktPriceUsd()
  ]);

  const settlementBlocks = await getRecentSettlementBlocks(SAMPLE_BLOCKS_PER_WINDOW[window]);
  const cachedBlocks = getCachedSettlementBlocks(settlementBlocks.map((block) => block.height));
  const missingSettlementBlocks = settlementBlocks.filter((block) => !cachedBlocks.has(block.height));

  const settlements: SettlementEvent[] = [];
  let scannedSettlementHeights = settlementBlocks.length;
  let scannedHeights = missingSettlementBlocks.length;

  for (const block of settlementBlocks) {
    const cachedBlock = cachedBlocks.get(block.height);
    if (!cachedBlock) continue;

    const events = JSON.parse(cachedBlock.events_json) as RpcEvent[];
    for (const event of events) {
      if (event.type !== SETTLEMENT_EVENT_TYPE) continue;
      settlements.push(parseSettlementEvent(event, block.height, cachedBlock.block_time, serviceMap));
    }
  }

  for (let start = 0; start < missingSettlementBlocks.length; start += 20) {
    const batch = missingSettlementBlocks.slice(start, start + 20);
    const batchResults = await mapConcurrent(batch, 6, async (height) => {
      try {
        const events = await getFinalizeEvents(height.height);
        return { height: height.height, blockTime: height.time, events, skipped: false };
      } catch {
        return { height: height.height, blockTime: height.time, events: [], skipped: true };
      }
    });

    for (const result of batchResults) {
      if (result.skipped) {
        continue;
      }

      saveSettlementBlock(result.height, result.blockTime, JSON.stringify(result.events));

      for (const event of result.events) {
        if (event.type !== SETTLEMENT_EVENT_TYPE) continue;
        settlements.push(parseSettlementEvent(event, result.height, result.blockTime, serviceMap));
      }
    }
  }

  const dashboard = buildDashboard(window, latestHeight, settlements, supplierDirectory, poktPriceUsd);
  const finalized: DashboardData = {
    ...dashboard,
    scannedHeights,
    scannedSettlementHeights
  };

  dashboardCache.set(window, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data: finalized
  });

  return finalized;
}

async function loadDashboard(window: TimeWindow): Promise<DashboardData> {
  const cached = dashboardCache.get(window);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const dashboard = await loadDashboardFromPoktscan(window);
    dashboardCache.set(window, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: dashboard
    });
    return dashboard;
  } catch {
    return loadDashboardFromRpc(window);
  }
}

export const getDashboardData = cache(loadDashboard);
