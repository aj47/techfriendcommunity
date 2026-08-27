import { useEffect } from "react";

export type ToolResult = { content: Array<{ type: "text"; text: string }> };

export type ToolDef = {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute: (input: any) => Promise<ToolResult> | ToolResult;
};

export function text(t: string): ToolResult {
  return { content: [{ type: "text", text: t }] };
}

type ModelContext = {
  registerTool: (tool: ToolDef, opts?: { signal?: AbortSignal }) => Promise<void>;
};

// Register a WebMCP tool for the lifetime of the component (unregisters on unmount
// or when deps change). Safe in browsers without WebMCP: it simply does nothing.
export function useWebMCPTool(tool: ToolDef, deps: unknown[]) {
  useEffect(() => {
    const mc = (document as unknown as { modelContext?: ModelContext }).modelContext;
    if (!mc) return;
    const controller = new AbortController();
    mc.registerTool(tool, { signal: controller.signal }).catch((err: { name?: string }) => {
      if (err?.name !== "NotAllowedError") console.error("registerTool failed", tool.name, err);
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
