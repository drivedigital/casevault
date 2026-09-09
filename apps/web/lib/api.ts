import type {
  Actor,
  ActorDossier,
  Matter,
  MatterActor,
  MatterLink,
  Workspace,
} from "./types";

// Relative paths: the Next dev server proxies /api/v1/* to the API
// (see next.config.mjs), so browser code never hard-codes the API host.
const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(resp.status, String(detail));
  }
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

export const api = {
  getCurrentWorkspace: () => apiFetch<Workspace>("/workspaces/current"),

  listMatters: (params?: { status?: string; matter_type?: string }) => {
    const qs = new URLSearchParams(
      Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][],
    ).toString();
    return apiFetch<Matter[]>(`/matters${qs ? `?${qs}` : ""}`);
  },
  getMatter: (id: string) => apiFetch<Matter>(`/matters/${id}`),
  createMatter: (payload: Partial<Matter> & { name: string }) =>
    apiFetch<Matter>("/matters", { method: "POST", body: JSON.stringify(payload) }),
  updateMatter: (id: string, payload: Partial<Matter>) =>
    apiFetch<Matter>(`/matters/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  listLinks: (matterId: string) => apiFetch<MatterLink[]>(`/matters/${matterId}/links`),
  createLink: (matterId: string, toMatterId: string, linkType: string, notes?: string) =>
    apiFetch<MatterLink>(`/matters/${matterId}/links`, {
      method: "POST",
      body: JSON.stringify({ to_matter_id: toMatterId, link_type: linkType, notes }),
    }),
  deleteLink: (linkId: string) => apiFetch<void>(`/matter-links/${linkId}`, { method: "DELETE" }),

  listActors: (q?: string) =>
    apiFetch<Actor[]>(`/actors${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getActor: (id: string) => apiFetch<ActorDossier>(`/actors/${id}`),
  createActor: (payload: {
    display_name: string;
    actor_type: string;
    description?: string;
    aliases?: string[];
  }) => apiFetch<Actor>("/actors", { method: "POST", body: JSON.stringify(payload) }),
  updateActor: (id: string, payload: Partial<Actor>) =>
    apiFetch<Actor>(`/actors/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  addAlias: (actorId: string, aliasText: string, aliasType?: string) =>
    apiFetch(`/actors/${actorId}/aliases`, {
      method: "POST",
      body: JSON.stringify({ alias_text: aliasText, alias_type: aliasType || null }),
    }),
  deleteAlias: (aliasId: string) =>
    apiFetch<void>(`/actor-aliases/${aliasId}`, { method: "DELETE" }),

  listMatterActors: (matterId: string) =>
    apiFetch<MatterActor[]>(`/matters/${matterId}/actors`),
  assignRole: (matterId: string, actorId: string, roleLabel: string, notes?: string) =>
    apiFetch<MatterActor>(`/matters/${matterId}/actors`, {
      method: "POST",
      body: JSON.stringify({ actor_id: actorId, role_label: roleLabel, notes }),
    }),
  deleteRole: (roleId: string) => apiFetch<void>(`/matter-roles/${roleId}`, { method: "DELETE" }),
};
