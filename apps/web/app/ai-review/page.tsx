import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="AI Review"
      summary="Multi-agent analysis council: run several providers/personas on one question, compare answers, and record exactly what was shared."
      planned={["Provider-agnostic connectors (OpenAI-compatible, Anthropic, Gemini, xAI, OpenRouter, local models)","Saved personas: strategist, red team, evidence auditor, gap detector","Run manifests recording context shared, model, prompt version, disposition"]}
    />
  );
}
