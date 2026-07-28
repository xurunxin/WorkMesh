import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { requestNetworkIdentity } from "./client-ip.js";

const apps: Array<ReturnType<typeof Fastify>> = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function resolve(
  trustProxy: false | string[],
  headers: Record<string, string>,
  remoteAddress: string,
) {
  const app = Fastify({ trustProxy });
  apps.push(app);
  app.get("/", (request) => requestNetworkIdentity(request));
  const response = await app.inject({
    method: "GET",
    url: "/",
    headers,
    remoteAddress,
  });
  return response.json<{ socketPeer: string; clientIp: string }>();
}

describe("trusted proxy address derivation", () => {
  it("ignores spoofed forwarding headers when the socket peer is not trusted", async () => {
    await expect(
      resolve(
        ["10.0.0.0/8"],
        { "x-forwarded-for": "198.51.100.7" },
        "203.0.113.9",
      ),
    ).resolves.toEqual({ socketPeer: "203.0.113.9", clientIp: "203.0.113.9" });
  });

  it("walks a trusted chain from the socket and stops at the nearest untrusted hop", async () => {
    await expect(
      resolve(
        ["127.0.0.1/32"],
        { "x-forwarded-for": "198.51.100.7, 203.0.113.8" },
        "127.0.0.1",
      ),
    ).resolves.toEqual({ socketPeer: "127.0.0.1", clientIp: "203.0.113.8" });
  });

  it("walks a multi-hop IPv6 chain across only explicitly trusted CIDRs", async () => {
    await expect(
      resolve(
        ["2001:db8:1::/48", "2001:db8:2::/48"],
        {
          "x-forwarded-for":
            "2001:db8:ffff::7, 2001:0db8:0002:0000:0000:0000:0000:0020",
        },
        "2001:db8:1::10",
      ),
    ).resolves.toEqual({
      socketPeer: "2001:db8:1::10",
      clientIp: "2001:db8:ffff::7",
    });
  });

  it("normalizes a malformed forwarded hop to unknown even behind a trusted peer", async () => {
    await expect(
      resolve(
        ["127.0.0.1/32"],
        { "x-forwarded-for": "198.51.100.7, malformed" },
        "127.0.0.1",
      ),
    ).resolves.toEqual({ socketPeer: "127.0.0.1", clientIp: "unknown" });
  });

  it("does not trust headers by hop count", async () => {
    const value = await resolve(
      false,
      { "x-forwarded-for": "malformed" },
      "::ffff:192.0.2.10",
    );
    expect(value).toEqual({ socketPeer: "192.0.2.10", clientIp: "192.0.2.10" });
  });
});
