import { createFileRoute } from "@tanstack/react-router";
import { ProviderPrivacySettingsPanel } from "../components/settings/ProviderPrivacySettings";

export const Route = createFileRoute("/_chat/settings/privacy")({
  component: ProviderPrivacySettingsPanel,
});
