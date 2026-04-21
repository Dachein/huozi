/**
 * Identity — dispatcher. Pick the right implementation for the current
 * edition and return an `IdentityService`.
 *
 * Public surface:
 *   - `getIdentity()` → IdentityService (async, factory)
 *   - All types from ./types
 *
 * Callers should never import ./cloud or ./edge directly — go through
 * this module so edition differences stay behind one seam.
 */

import { getEdition } from "../edition";
import { createCloudIdentity } from "./cloud";
import { createEdgeIdentity } from "./edge";
import type { IdentityService } from "./types";

export type {
  AgentKind,
  Connection,
  CreateWorkspaceResult,
  IdentityService,
  Principal,
  Workspace,
} from "./types";

export async function getIdentity(): Promise<IdentityService> {
  return getEdition() === "edge"
    ? createEdgeIdentity()
    : createCloudIdentity();
}
