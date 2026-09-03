// Rasterizes a card SVG to PNG with resvg, compiled to WebAssembly.
//
// Everything the renderer needs — the wasm binary and the Inter subsets the
// cards are set in — is base64 inside convex/ogRuntime.generated.ts, so a cold
// isolate can answer an unfurler without an outbound fetch to a CDN that might
// be slow, rate-limited, or gone. Init measures ~30ms, a 1200x630 card ~120ms.
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import { fontsBase64, resvgWasmBase64 } from "../ogRuntime.generated";
import { CARD_W } from "./card";

function bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// initWasm throws if it runs twice in one isolate, and an isolate serves many
// requests, so the promise is memoized — but a *failed* init is not, or every
// later request in that isolate would inherit the first one's bad luck.
let wasmReady: Promise<void> | null = null;
let fonts: Uint8Array[] | null = null;

export async function renderPng(svg: string): Promise<Uint8Array> {
  if (!wasmReady) {
    wasmReady = initWasm(bytes(resvgWasmBase64)).catch((e) => {
      wasmReady = null;
      throw e;
    });
  }
  await wasmReady;
  fonts ??= fontsBase64.map(bytes);

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: CARD_W },
    // No system fonts to fall back on in this runtime: a family the SVG asks
    // for that isn't in these buffers renders as nothing at all.
    font: { fontBuffers: fonts, defaultFontFamily: "Inter", sansSerifFamily: "Inter" },
    textRendering: 2, // geometricPrecision — the cards are read at 1:1 or larger
  });
  const image = resvg.render();
  try {
    return image.asPng();
  } finally {
    // Both hold wasm-side allocations, and the isolate outlives the request.
    image.free();
    resvg.free();
  }
}
