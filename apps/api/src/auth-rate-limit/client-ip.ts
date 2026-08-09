import net from "node:net";
import type { FastifyRequest } from "fastify";

function parseIpv4(address: string): number[] | undefined {
  const parts = address.split(".");
  if (parts.length !== 4) return undefined;
  const values = parts.map((part) => Number(part));
  return values.every(
    (value) => Number.isInteger(value) && value >= 0 && value <= 255,
  )
    ? values
    : undefined;
}

function ipv6Words(address: string): number[] | undefined {
  const zoneIndex = address.indexOf("%");
  const raw = (
    zoneIndex >= 0 ? address.slice(0, zoneIndex) : address
  ).toLowerCase();
  const embedded = raw.includes(".")
    ? parseIpv4(raw.slice(raw.lastIndexOf(":") + 1))
    : undefined;
  const normalized = embedded
    ? `${raw.slice(0, raw.lastIndexOf(":"))}:${((embedded[0]! << 8) | embedded[1]!).toString(16)}:${((embedded[2]! << 8) | embedded[3]!).toString(16)}`
    : raw;
  if (normalized.split("::").length > 2) return undefined;
  const [leftRaw, rightRaw] = normalized.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if (!left.concat(right).every((part) => /^[0-9a-f]{1,4}$/.test(part)))
    return undefined;
  const missing = 8 - left.length - right.length;
  if (
    (normalized.includes("::") && missing < 1) ||
    (!normalized.includes("::") && missing !== 0)
  )
    return undefined;
  return [
    ...left.map((part) => parseInt(part, 16)),
    ...Array(missing).fill(0),
    ...right.map((part) => parseInt(part, 16)),
  ];
}

function formatIpv6(words: number[]): string {
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return `${(words[6]! >> 8) & 255}.${words[6]! & 255}.${(words[7]! >> 8) & 255}.${words[7]! & 255}`;
  }
  let bestStart = -1;
  let bestLength = 0;
  for (let start = 0; start < words.length;) {
    if (words[start] !== 0) {
      start += 1;
      continue;
    }
    let end = start;
    while (end < words.length && words[end] === 0) end += 1;
    if (end - start > bestLength && end - start >= 2) {
      bestStart = start;
      bestLength = end - start;
    }
    start = end;
  }
  const parts: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    if (index === bestStart) {
      parts.push("");
      index += bestLength - 1;
      if (index === words.length - 1) parts.push("");
    } else {
      parts.push(words[index]!.toString(16));
    }
  }
  return parts.join(":") || "::";
}

export function normalizeIp(address: string | undefined): string {
  if (!address) return "unknown";
  const value = address.trim();
  if (net.isIP(value) === 4) return parseIpv4(value)!.join(".");
  if (net.isIP(value) === 6) return formatIpv6(ipv6Words(value)!);
  return "unknown";
}

export function requestNetworkIdentity(request: FastifyRequest): {
  socketPeer: string;
  clientIp: string;
} {
  return {
    socketPeer: normalizeIp(request.socket.remoteAddress),
    clientIp: normalizeIp(request.ip),
  };
}
