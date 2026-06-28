import { ConfigManager, type Vault } from '../services/ConfigManager.js';
import { ObsidianParser, type ObsidianConfig } from '../services/ObsidianParser.js';
import { VaultDiscovery } from '../services/VaultDiscovery.js';
import { VaultNotFoundError } from './errors.js';

export type { Vault };

/**
 * Resolve a vault by name (or the configured default) to its config entry.
 *
 * Shared by the CLI and the MCP server so vault lookup + the "not found" failure
 * mode live in one place. Pass a pre-loaded `ConfigManager` to reuse a warmed
 * config (the long-lived server resolves once at startup); the CLI lets it
 * default to a fresh load per invocation.
 *
 * @throws {VaultNotFoundError} when no vault matches and no default applies.
 */
export async function resolveVault(name?: string, mgr: ConfigManager = new ConfigManager()): Promise<Vault> {
  const cfg = await mgr.load();
  const v = mgr.getVault(cfg, name);
  if (!v) {
    throw new VaultNotFoundError(name);
  }
  return v;
}

/** Vault metadata (name + path). */
export function vaultInfo(vault: Vault): Vault {
  return vault;
}

/** Parsed `.obsidian` settings for the vault, with the resolved inbox folder. */
export async function vaultObsidian(vault: Vault): Promise<ObsidianConfig> {
  return new ObsidianParser(vault.path).load();
}

/** Discovered PARA + Johnny Decimal destinations for the vault. */
export async function vaultStructure(vault: Vault) {
  return new VaultDiscovery(vault.path).discover();
}
