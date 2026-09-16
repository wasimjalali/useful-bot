export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export const SPEEDS = ["standard", "fast"] as const;

export type EffortId = (typeof EFFORTS)[number];
export type SpeedId = (typeof SPEEDS)[number];

export type ModelOption = {
  id: string;
  label: string;
  efforts: EffortId[];
  defaultEffort: EffortId | null;
  speeds: SpeedId[];
  defaultSpeed: SpeedId;
  /** Context window in tokens from the models.dev catalog; absent when unknown. */
  contextTokens?: number;
  /** Input modalities from the catalog ("text", "image", ...); absent when unknown. */
  inputs?: string[];
};

/** Catalog facts about one model that the live list cannot tell on its own. */
export type ModelMeta = { contextTokens?: number; inputs?: string[] };

/**
 * Whether the model takes image input. Null when the catalog has not said:
 * a caller that gates on it lets the upstream decide rather than refusing
 * on missing data.
 */
export function modelSeesImages(model: Pick<ModelOption, "inputs"> | null | undefined): boolean | null {
  if (!model?.inputs) return null;
  return model.inputs.includes("image");
}

export type ComposerPublic = {
  providerId: string;
  providerName: string;
  modelId: string;
  modelLabel: string;
  effort: EffortId | null;
  effortLabel: string | null;
  speed: SpeedId;
  efforts: Array<{ id: EffortId; label: string }>;
  speeds: Array<{ id: SpeedId; label: string }>;
  models: Array<{ id: string; label: string }>;
};

const EFFORT_LABELS: Record<EffortId, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};

const SPEED_LABELS: Record<SpeedId, string> = {
  standard: "Standard",
  fast: "Fast",
};

const OPTIONS: Record<string, ModelOption[]> = {
  "opencode-go": [
    {
      id: "glm-5.3-flash",
      label: "GLM 5.3 Flash",
      efforts: ["low", "high", "max"],
      defaultEffort: "low",
      speeds: ["standard"],
      defaultSpeed: "standard",
    },
    {
      id: "glm-5.3",
      label: "GLM 5.3",
      efforts: ["low", "high", "max"],
      defaultEffort: "high",
      speeds: ["standard"],
      defaultSpeed: "standard",
    },
  ],
  openai: [
    {
      id: "gpt-4.1-mini",
      label: "GPT-4.1 Mini",
      efforts: [],
      defaultEffort: null,
      speeds: ["standard", "fast"],
      defaultSpeed: "standard",
    },
    {
      id: "gpt-4.1",
      label: "GPT-4.1",
      efforts: [],
      defaultEffort: null,
      speeds: ["standard", "fast"],
      defaultSpeed: "standard",
    },
  ],
  openrouter: [
    {
      id: "openai/gpt-4.1-mini",
      label: "GPT-4.1 Mini",
      efforts: [],
      defaultEffort: null,
      speeds: ["standard", "fast"],
      defaultSpeed: "standard",
    },
    {
      id: "anthropic/claude-sonnet-4",
      label: "Claude Sonnet 4",
      efforts: ["low", "high", "max"],
      defaultEffort: "high",
      speeds: ["standard", "fast"],
      defaultSpeed: "standard",
    },
  ],
  google: [
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      efforts: ["low", "high"],
      defaultEffort: "low",
      speeds: ["standard"],
      defaultSpeed: "standard",
    },
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      efforts: ["low", "high", "max"],
      defaultEffort: "high",
      speeds: ["standard"],
      defaultSpeed: "standard",
    },
  ],
  anthropic: [
    {
      id: "claude-sonnet-4-0",
      label: "Claude Sonnet 4",
      efforts: ["low", "high", "max"],
      defaultEffort: "high",
      speeds: ["standard"],
      defaultSpeed: "standard",
    },
  ],
};

export function isEffortId(value: unknown): value is EffortId {
  return typeof value === "string" && (EFFORTS as readonly string[]).includes(value);
}

export function isSpeedId(value: unknown): value is SpeedId {
  return typeof value === "string" && (SPEEDS as readonly string[]).includes(value);
}

export function effortLabel(id: EffortId): string {
  return EFFORT_LABELS[id];
}

export function speedLabel(id: SpeedId): string {
  return SPEED_LABELS[id];
}

export function modelsFor(providerId: string): ModelOption[] {
  return OPTIONS[providerId] ?? [];
}

export function humanizeModelId(id: string): string {
  const slug = id.split("/").pop() ?? id;
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "glm") return "GLM";
      if (lower === "gpt") return "GPT";
      if (lower === "kimi") return "Kimi";
      if (lower === "qwen3.8" || lower === "qwen3.7" || lower === "qwen3.6" || lower === "qwen3.5") {
        return `Qwen${part.slice(4)}`;
      }
      if (lower.startsWith("qwen")) return `Qwen${part.slice(4)}`;
      if (lower === "grok") return "Grok";
      if (lower === "mimo") return "MiMo";
      if (lower === "minimax") return "MiniMax";
      if (lower === "deepseek") return "DeepSeek";
      if (lower === "muse") return "Muse";
      if (lower === "hy3" || lower === "hy4") return part.toUpperCase();
      if (lower === "longcat") return "LongCat";
      if (lower === "omen") return "Omen";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function speedCaps(providerId?: string): Pick<ModelOption, "speeds" | "defaultSpeed"> {
  if (providerId === "openai" || providerId === "openrouter") {
    return { speeds: ["standard", "fast"], defaultSpeed: "standard" };
  }
  return { speeds: ["standard"], defaultSpeed: "standard" };
}

export function inferCapabilities(
  id: string,
  providerId?: string,
): Pick<ModelOption, "efforts" | "defaultEffort" | "speeds" | "defaultSpeed"> {
  const slug = id.toLowerCase();
  const standard = speedCaps(providerId);
  if (slug.includes("glm")) {
    return { ...standard, efforts: ["low", "high", "max"], defaultEffort: slug.includes("flash") ? "low" : "high" };
  }
  if (slug.includes("kimi") || slug.includes("deepseek") || slug.includes("mimo")) {
    return { ...standard, efforts: ["low", "high", "max"], defaultEffort: slug.includes("flash") ? "low" : "high" };
  }
  if (slug.includes("grok") || slug.includes("luna") || slug.includes("muse")) {
    return { ...standard, efforts: ["low", "medium", "high", "xhigh"], defaultEffort: "high" };
  }
  if (slug.includes("hy4")) {
    return { ...standard, efforts: ["low", "medium", "high", "xhigh", "max"], defaultEffort: "high" };
  }
  if (slug.includes("hy3")) {
    return { ...standard, efforts: ["low", "high"], defaultEffort: "low" };
  }
  if (slug.includes("qwen") || slug.includes("minimax") || slug.includes("longcat")) {
    return { ...standard, efforts: ["high", "max"], defaultEffort: "high" };
  }
  if (slug.includes("gemini")) {
    return { ...standard, efforts: ["low", "high"], defaultEffort: slug.includes("flash") ? "low" : "high" };
  }
  if (slug.includes("claude") || slug.includes("sonnet") || slug.includes("opus")) {
    return { ...standard, efforts: ["low", "high", "max"], defaultEffort: "high" };
  }
  return { ...standard, efforts: [], defaultEffort: null };
}

export function hydrateModel(providerId: string, id: string, label?: string, meta?: ModelMeta): ModelOption {
  const known = modelsFor(providerId).find((item) => item.id === id);
  const base = known
    ? { ...known, label: label?.trim() || known.label }
    : { id, label: label?.trim() || humanizeModelId(id), ...inferCapabilities(id, providerId) };
  if (meta?.contextTokens) base.contextTokens = meta.contextTokens;
  if (meta?.inputs) base.inputs = meta.inputs;
  return base;
}

export function mergeLiveModels(
  providerId: string,
  ids: string[],
  meta: Record<string, ModelMeta> = {},
): ModelOption[] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const models = unique.map((id) => hydrateModel(providerId, id, undefined, meta[id]));
  const preferred = modelsFor(providerId)[0]?.id;
  return models.sort((a, b) => {
    if (a.id === preferred) return -1;
    if (b.id === preferred) return 1;
    return a.label.localeCompare(b.label);
  });
}

export function modelOption(
  providerId: string,
  modelId: string | null | undefined,
  catalog?: ModelOption[],
): ModelOption | null {
  const list = catalog && catalog.length > 0 ? catalog : modelsFor(providerId);
  return list.find((item) => item.id === modelId) ?? list[0] ?? null;
}

export function snapComposer(
  providerId: string,
  providerName: string,
  preferredModel: string | null | undefined,
  preferredEffort: EffortId | null | undefined,
  preferredSpeed: SpeedId | null | undefined,
  catalog?: ModelOption[],
): ComposerPublic {
  const list = catalog && catalog.length > 0 ? catalog : modelsFor(providerId);
  const model = modelOption(providerId, preferredModel, list);
  if (!model) {
    return {
      providerId,
      providerName,
      modelId: "",
      modelLabel: providerName,
      effort: null,
      effortLabel: null,
      speed: "standard",
      efforts: [],
      speeds: [],
      models: [],
    };
  }
  const effort = model.efforts.length === 0
    ? null
    : (preferredEffort && model.efforts.includes(preferredEffort) ? preferredEffort : model.defaultEffort);
  const speed = preferredSpeed && model.speeds.includes(preferredSpeed) ? preferredSpeed : model.defaultSpeed;
  return {
    providerId,
    providerName,
    modelId: model.id,
    modelLabel: model.label,
    effort,
    effortLabel: effort ? effortLabel(effort) : null,
    speed,
    efforts: model.efforts.map((id) => ({ id, label: effortLabel(id) })),
    speeds: model.speeds.map((id) => ({ id, label: speedLabel(id) })),
    models: list.map((item) => ({ id: item.id, label: item.label })),
  };
}

export function applyReasoning(
  providerId: string,
  effort: EffortId | null,
  speed: SpeedId,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...body };
  if (effort) {
    const modelId = typeof body.model === "string" ? body.model : "";
    const model = hydrateModel(providerId, modelId);
    if (model.efforts.includes(effort)) {
      next.reasoning_effort = effort;
    } else if (providerId === "opencode-go") {
      next.reasoning_effort = effort === "xhigh" ? "high" : effort === "medium" ? "low" : effort;
    } else {
      next.reasoning_effort = effort;
    }
  }
  if (speed === "fast" && (providerId === "openai" || providerId === "openrouter")) {
    next.service_tier = "priority";
  }
  return next;
}
