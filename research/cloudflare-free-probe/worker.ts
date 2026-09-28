import { parseSubscription } from "@subboost/core/parser";
import { generateClashYaml } from "@subboost/core/generator";
import bcrypt from "bcryptjs";

const encoder = new TextEncoder();
const credentials = btoa("aes-128-gcm:synthetic-secret");

export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname === "/bcrypt") {
      const start = performance.now();
      const hash = bcrypt.hashSync("synthetic-password", 12);
      const afterHash = performance.now();
      const valid = bcrypt.compareSync("synthetic-password", hash);
      return Response.json({ valid, hashMs: afterHash - start, verifyMs: performance.now() - afterHash });
    }
    const count = Number(url.searchParams.get("nodes") || 1);
    if (!Number.isInteger(count) || count < 1 || count > 10_000) {
      return Response.json({ error: "nodes must be an integer from 1 to 10000" }, { status: 400 });
    }

    const content = Array.from({ length: count }, (_, index) =>
      `ss://${credentials}@node-${index}.example.com:8388#Node-${index}`
    ).join("\n");
    const start = performance.now();
    const parsed = parseSubscription(content);
    const afterParse = performance.now();
    const yaml = generateClashYaml({ nodes: parsed.nodes });
    const afterGenerate = performance.now();

    return Response.json({
      requestedNodes: count,
      parsedNodes: parsed.nodes.length,
      parseErrors: parsed.errors.length,
      inputBytes: encoder.encode(content).byteLength,
      outputBytes: encoder.encode(yaml).byteLength,
      parseMs: Number((afterParse - start).toFixed(3)),
      generateMs: Number((afterGenerate - afterParse).toFixed(3)),
      totalMs: Number((afterGenerate - start).toFixed(3)),
    });
  },
};
