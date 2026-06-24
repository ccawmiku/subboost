import { describe, expect, it, vi } from "vitest";
import { resolveHostnameByDoh, type DohTransportResponse } from "./doh-resolver";

function dnsResponse(records: Array<{ type: "A" | "AAAA"; address: string }>): Uint8Array {
  const question = new Uint8Array([
    7, 101, 120, 97, 109, 112, 108, 101, 4, 116, 101, 115, 116, 0, 0, 1, 0, 1,
  ]);
  const answers: number[] = [];
  for (const record of records) {
    answers.push(0xc0, 0x0c);
    if (record.type === "A") {
      answers.push(0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x04);
      answers.push(...record.address.split(".").map((part) => Number(part)));
    } else {
      answers.push(0x00, 0x1c, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x10);
      const parts = record.address.split(":").map((part) => Number.parseInt(part || "0", 16));
      for (const part of parts) {
        answers.push((part >> 8) & 0xff, part & 0xff);
      }
    }
  }

  const out = new Uint8Array(12 + question.length + answers.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0);
  view.setUint16(2, 0x8180);
  view.setUint16(4, 1);
  view.setUint16(6, records.length);
  out.set(question, 12);
  out.set(answers, 12 + question.length);
  return out;
}

function ok(body: Uint8Array): DohTransportResponse {
  return { statusCode: 200, body };
}

function header(questionCount: number, answerCount: number): Uint8Array {
  const out = new Uint8Array(12);
  const view = new DataView(out.buffer);
  view.setUint16(4, questionCount);
  view.setUint16(6, answerCount);
  return out;
}

function malformedAnswerName(firstNameByte: number): Uint8Array {
  const out = new Uint8Array(13);
  out.set(header(0, 1));
  out[12] = firstNameByte;
  return out;
}

describe("RFC8484 DoH resolver", () => {
  it("posts DNS wire messages and returns A/AAAA addresses from the first usable endpoint", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(ok(dnsResponse([{ type: "A", address: "93.184.216.34" }])))
      .mockResolvedValueOnce(ok(dnsResponse([{ type: "AAAA", address: "2606:4700:4700:0:0:0:0:1111" }])));

    await expect(
      resolveHostnameByDoh(" Example.Test. ", {
        endpoints: ["https://doh.example/dns-query"],
        timeoutMs: 2500,
        transport,
      })
    ).resolves.toEqual(["93.184.216.34", "2606:4700:4700:0:0:0:0:1111"]);

    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        endpoint: "https://doh.example/dns-query",
        headers: {
          Accept: "application/dns-message",
          "Content-Type": "application/dns-message",
        },
        body: expect.any(Uint8Array),
        timeoutMs: 2500,
      })
    );
  });

  it("falls through empty or failed endpoints and returns an empty list fail-closed", async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(ok(dnsResponse([])))
      .mockResolvedValueOnce({ statusCode: 503, body: new Uint8Array() })
      .mockResolvedValueOnce(ok(dnsResponse([{ type: "A", address: "1.1.1.1" }])))
      .mockResolvedValueOnce(ok(dnsResponse([])));

    await expect(
      resolveHostnameByDoh("example.test", {
        endpoints: ["https://empty.example/dns-query", "https://ok.example/dns-query"],
        transport,
      })
    ).resolves.toEqual(["1.1.1.1"]);

    await expect(
      resolveHostnameByDoh("example.test", {
        endpoints: ["https://empty.example/dns-query"],
        transport: vi.fn().mockResolvedValue(ok(dnsResponse([]))),
      })
    ).resolves.toEqual([]);
  });

  it("fails closed for blank hostnames, malformed DNS messages, and thrown endpoints", async () => {
    const longQuestion = [
      ...Array.from({ length: 129 }, () => [1, 97]).flat(),
      0,
      0,
      1,
      0,
      1,
    ];
    const truncatedData = new Uint8Array([
      ...Array.from(header(0, 1)),
      0xc0,
      0x0c,
      0x00,
      0x01,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x3c,
      0x00,
      0x04,
      1,
      2,
    ]);
    const malformedBodies = [
      new Uint8Array([1, 2, 3]),
      header(1, 0),
      header(0, 1),
      truncatedData,
      malformedAnswerName(0xc0),
      malformedAnswerName(0x80),
      new Uint8Array([...Array.from(header(1, 0)), ...longQuestion]),
    ];
    const transport = vi.fn(async () => {
      const body = malformedBodies.shift();
      if (body) return ok(body);
      throw new Error("endpoint unavailable");
    });

    await expect(resolveHostnameByDoh("   ", { transport })).resolves.toEqual([]);
    await expect(
      resolveHostnameByDoh("example.test", {
        endpoints: ["https://bad-a.example/dns-query", "https://bad-b.example/dns-query", "https://bad-c.example/dns-query", "https://bad-d.example/dns-query"],
        transport,
      })
    ).resolves.toEqual([]);

    expect(transport).toHaveBeenCalledTimes(8);
  });
});
