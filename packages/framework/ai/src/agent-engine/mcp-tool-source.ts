import type { McpServerService } from "../services/mcp-server";
import type { AgentTool } from "./types";

export interface McpToolSource {
  loadTools(serverIds: string[], tenantId: string): Promise<AgentTool[]>;
}

function safeToolName(serverName: string, toolName: string): string {
  return `mcp_${serverName}_${toolName}`
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 64);
}

function resultToText(result: unknown): string {
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    return result.map((item) => {
      if (typeof item === "object" && item !== null && "text" in item) {
        return String((item as { text: unknown }).text);
      }
      return JSON.stringify(item);
    }).join("\n");
  }
  return JSON.stringify(result);
}

/** Adapt configured MCP servers to the same AgentTool seam as local tools. */
export function createMcpToolSource(service: McpServerService): McpToolSource {
  return {
    async loadTools(serverIds, tenantId) {
      const tools: AgentTool[] = [];
      const seenNames = new Set<string>();
      for (const serverId of [...new Set(serverIds)]) {
        const server = await service.getById(serverId, tenantId);
        if (!server?.enabled) continue;
        const discovered = server.toolsSnapshot ?? (await service.refreshTools(server.id, tenantId));
        for (const remoteTool of discovered) {
          const name = safeToolName(server.name, remoteTool.name);
          if (seenNames.has(name)) throw new Error(`Duplicate MCP tool name: ${name}`);
          seenNames.add(name);
          tools.push({
            name,
            label: `${server.name}: ${remoteTool.name}`,
            description: remoteTool.description || `MCP tool ${remoteTool.name} from ${server.name}`,
            parameters: remoteTool.inputSchema ?? {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            riskLevel: "high",
            requiresApproval: true,
            timeout: 60_000,
            async execute(_toolCallId, params, signal) {
              const result = await service.callTool(server.id, tenantId, remoteTool.name, params, signal);
              return {
                content: [{ type: "text", text: resultToText(result) }],
                details: { serverId: server.id, remoteTool: remoteTool.name, result },
              };
            },
          });
        }
      }
      return tools;
    },
  };
}
