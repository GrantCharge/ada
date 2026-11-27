import { T } from "gt-react";
import { TRIAGE_CLI_GUIDANCE } from "~/hooks/useStartTriage";

import { SharedTooltipTrigger } from "../ui/shared-tooltip";
import { APP_NAME } from "@t3tools/shared/branding";

/**
 * The empty-draft hero for a triage session, in place of "What should we work on?".
 * Keeps the regular hero's heading-plus-one-line rhythm above the composer.
 */
export function TriageDraftHero(props: {
  readonly machineLabel: string | null;
  readonly serverVersion: string | null;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center">
      <h1 className="w-full text-center font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
        <T>What went wrong?</T>
      </h1>
      <p className="mt-2 flex h-6 w-full items-center justify-center gap-1.5 text-sm">
        <SharedTooltipTrigger
          render={<span tabIndex={0} className="min-w-0 truncate font-medium text-foreground" />}
          label={`The agent reads ${APP_NAME}'s logs and source here, and asks before it applies a fix or posts anything.`}
          side="bottom"
        >
          {props.machineLabel ?? <T>This machine</T>}
          {props.serverVersion === null ? null : (
            <span className="ml-1.5 font-normal text-muted-foreground">v{props.serverVersion}</span>
          )}
        </SharedTooltipTrigger>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <SharedTooltipTrigger
          render={<span tabIndex={0} className="text-muted-foreground" />}
          label={`In a terminal on that machine, ${TRIAGE_CLI_GUIDANCE}.`}
          side="bottom"
        >
          or run <code className="font-mono text-xs">triage</code>
        </SharedTooltipTrigger>
      </p>
    </div>
  );
}
