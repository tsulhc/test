const UPOKT_PER_POKT = 1_000_000;

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("it-IT").format(value);
}

export function formatDecimal(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value);
}

export function formatUpokt(upokt: bigint, maximumFractionDigits = 2): string {
  const sign = upokt < 0n ? "-" : "";
  const absolute = upokt < 0n ? -upokt : upokt;
  const whole = absolute / BigInt(UPOKT_PER_POKT);
  const fraction = absolute % BigInt(UPOKT_PER_POKT);
  const fractionString = fraction.toString().padStart(6, "0").slice(0, maximumFractionDigits);
  const wholeFormatted = new Intl.NumberFormat("it-IT").format(Number(whole));

  if (maximumFractionDigits === 0 || Number(fractionString) === 0) {
    return `${sign}${wholeFormatted} POKT`;
  }

  return `${sign}${wholeFormatted},${fractionString} POKT`;
}

export function formatRelativeRange(window: string): string {
  switch (window) {
    case "24h":
      return "ultime 24 ore";
    case "7d":
      return "ultimi 7 giorni";
    case "30d":
      return "ultimi 30 giorni";
    default:
      return window;
  }
}

export function truncateAddress(address: string, head = 8, tail = 6): string {
  if (address.length <= head + tail + 3) return address;
  return `${address.slice(0, head)}...${address.slice(-tail)}`;
}

export function formatPercent(value: number, maximumFractionDigits = 1): string {
  return `${formatDecimal(value, maximumFractionDigits)}%`;
}

export function formatUsd(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits
  }).format(value);
}
