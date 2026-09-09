import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Settings / Integrations"
      summary="Workspace defaults, members and permissions, AI provider configuration, MCP connectors, storage, and diagnostics."
      planned={["AI-sharing policy defaults (default: no_ai — external sharing is opt-in)","AI provider setup showing credential status, never raw secrets","MCP connector registry with scope and health status"]}
    />
  );
}
