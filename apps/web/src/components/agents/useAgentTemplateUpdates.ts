import { useEffect, useEffectEvent, useState } from "react";
import type { AgentSkill } from "@t3tools/contracts";
import {
  agentTemplateUpdateStubs,
  agentTemplateUpdates,
} from "@t3tools/shared/agentTemplateUpdates";
import { useAgentLibrary } from "../../hooks/useAgentLibrary";
import { useBuiltInAgentPresets } from "./useBuiltInAgentPresets";

/**
 * Template updates for the library. Listed skills arrive as stubs, so their bodies are loaded to
 * drop copies that already hold the template; nothing is listed until that check settles.
 */
export function useAgentTemplateUpdates() {
  const { profiles, skills, available, loadSkills } = useAgentLibrary();
  const presets = useBuiltInAgentPresets();
  const [loaded, setLoaded] = useState<{
    readonly key: string;
    readonly skills: ReadonlyArray<AgentSkill>;
  }>({ key: "", skills: [] });
  const updates =
    presets && available
      ? agentTemplateUpdates(
          { agentSkills: skills, mcpGatewayProfiles: profiles },
          presets,
          loaded.skills,
        )
      : [];
  const stubs = agentTemplateUpdateStubs(updates, loaded.skills);
  const key = stubs.map((skill) => `${skill.skillId}:${skill.digest ?? ""}`).join(",");
  const pending = key !== "" && key !== loaded.key;
  const load = useEffectEvent(() =>
    loadSkills(stubs.map((skill) => skill.skillId)).catch((): ReadonlyArray<AgentSkill> => []),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- fetches skill bodies from the server.
  useEffect(() => {
    if (!pending) return;
    let live = true;
    void load().then((bodies) => {
      if (live) setLoaded((previous) => ({ key, skills: [...previous.skills, ...bodies] }));
    });
    return () => {
      live = false;
    };
  }, [key, pending]);
  return pending ? [] : updates;
}
