export interface AgentTemplateDates {
  readonly presets: Readonly<Record<string, string>>;
  readonly skills: Readonly<Record<string, string>>;
}

/** The date template updates shipped, and the template date a copy from before then took. */
export const AGENT_TEMPLATES_SHIPPED_AT = "2026-11-17T00:00:00.000Z";

/**
 * When each built-in template last changed in the repo. A copy that took an earlier date is
 * offered the update.
 */
export const AGENT_TEMPLATE_UPDATED_AT: AgentTemplateDates = {
  presets: {
    advosary: AGENT_TEMPLATES_SHIPPED_AT,
    captain: "2026-11-24T00:00:00.000Z",
    cleaner: AGENT_TEMPLATES_SHIPPED_AT,
    cook: AGENT_TEMPLATES_SHIPPED_AT,
    "cook-opensource": AGENT_TEMPLATES_SHIPPED_AT,
    pastry: AGENT_TEMPLATES_SHIPPED_AT,
  },
  skills: {
    "agentic-harness-design": AGENT_TEMPLATES_SHIPPED_AT,
    "captain-event-loop": "2026-11-24T00:00:00.000Z",
    diagnose: AGENT_TEMPLATES_SHIPPED_AT,
    "grill-me": AGENT_TEMPLATES_SHIPPED_AT,
    grilling: AGENT_TEMPLATES_SHIPPED_AT,
    "improve-codebase-architecture": AGENT_TEMPLATES_SHIPPED_AT,
    "new-pattern-project": AGENT_TEMPLATES_SHIPPED_AT,
    "playwright-cli": AGENT_TEMPLATES_SHIPPED_AT,
    "principle-prove-it-works": AGENT_TEMPLATES_SHIPPED_AT,
    retro: AGENT_TEMPLATES_SHIPPED_AT,
    "t3-agents": "2026-11-24T00:00:00.000Z",
    "worktree-cleanup-rule": AGENT_TEMPLATES_SHIPPED_AT,
  },
};
