export interface AgentTemplateDates {
  readonly presets: Readonly<Record<string, string>>;
  readonly skills: Readonly<Record<string, string>>;
}

/** The date template updates shipped, and the template date a copy from before then took. */
export const AGENT_TEMPLATES_SHIPPED_AT = "2026-11-17T00:00:00.000Z";

const AGENT_CONFIG_SYNCED_AT = "2026-11-27T00:00:00.000Z";

/**
 * When each built-in template last changed in the repo. A copy that took an earlier date is
 * offered the update.
 */
export const AGENT_TEMPLATE_UPDATED_AT: AgentTemplateDates = {
  presets: {
    advosary: AGENT_CONFIG_SYNCED_AT,
    captain: AGENT_CONFIG_SYNCED_AT,
    cleaner: AGENT_CONFIG_SYNCED_AT,
    cook: AGENT_CONFIG_SYNCED_AT,
    "cook-opensource": AGENT_CONFIG_SYNCED_AT,
    pastry: AGENT_CONFIG_SYNCED_AT,
  },
  skills: {
    "agentic-harness-design": AGENT_TEMPLATES_SHIPPED_AT,
    "captain-event-loop": AGENT_CONFIG_SYNCED_AT,
    davit: AGENT_CONFIG_SYNCED_AT,
    diagnose: AGENT_TEMPLATES_SHIPPED_AT,
    "github-git": AGENT_CONFIG_SYNCED_AT,
    grilling: AGENT_TEMPLATES_SHIPPED_AT,
    "improve-codebase-architecture": AGENT_CONFIG_SYNCED_AT,
    "native-first-tools": AGENT_CONFIG_SYNCED_AT,
    "new-pattern-project": AGENT_CONFIG_SYNCED_AT,
    "playwright-cli": AGENT_CONFIG_SYNCED_AT,
    "principle-prove-it-works": AGENT_CONFIG_SYNCED_AT,
    retro: AGENT_CONFIG_SYNCED_AT,
    "t3-agents": "2026-11-24T00:00:00.000Z",
    "typesafe-ai": AGENT_CONFIG_SYNCED_AT,
    "worktree-cleanup-rule": AGENT_CONFIG_SYNCED_AT,
  },
};
