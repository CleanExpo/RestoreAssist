import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { PluginConfig } from "streamdown";

/**
 * Shared Streamdown plugin configuration.
 *
 * `streamdown` resolves the app's security-patched Shiki v4 declarations,
 * while `@streamdown/code` publishes the same runtime contract against Shiki
 * v3 declarations. The only structural difference is the compile-time
 * language-name union; unsupported language strings already fall back through
 * `supportsLanguage`. Keep the compatibility cast isolated here.
 */
export const streamdownPlugins: PluginConfig = {
  cjk,
  code: code as unknown as PluginConfig["code"],
  math,
  mermaid,
};
