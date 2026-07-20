export type NegativeProfile = {
  id: string;
  label: string;
  hints?: string;
  sport?: string;
  preserveSubject?: boolean;
  extra?: string;
  /** When set, used verbatim instead of calling /api/negative. */
  staticPrompt?: string;
};

export const DEFAULT_NEGATIVE_PROFILES: NegativeProfile[] = [
  {
    id: "general-sd",
    label: "General SD / SDXL",
    hints: "high quality scene",
    preserveSubject: true,
  },
  {
    id: "portrait",
    label: "Portrait",
    hints: "portrait, face, skin texture",
    preserveSubject: true,
    extra: "deformed face, extra fingers, blurry eyes, plastic skin, waxy skin, airbrushed, doll-like",
  },
  {
    id: "architecture",
    label: "Architecture / interior",
    hints: "architecture, interior, building",
    preserveSubject: false,
    extra: "people, figures, text watermark",
  },
  {
    id: "pet",
    label: "Pet / animal",
    hints: "pet, animal, fur detail",
    preserveSubject: true,
    extra: "extra limbs, deformed anatomy, human hands",
  },
  {
    id: "fantasy",
    label: "Fantasy / costume",
    hints: "fantasy costume, magical scene",
    preserveSubject: true,
    extra: "modern streetwear, logos, watermark",
  },
  {
    id: "sport-cycling",
    label: "Sport · cycling",
    sport: "cycling",
    preserveSubject: true,
  },
  {
    id: "sport-running",
    label: "Sport · running",
    sport: "running",
    preserveSubject: true,
  },
];

export function resolveNegativeProfile(
  profiles: NegativeProfile[] | undefined,
  profileId?: string,
): NegativeProfile | undefined {
  const list = profiles?.length ? profiles : DEFAULT_NEGATIVE_PROFILES;
  if (!profileId?.trim()) {
    return list[0];
  }
  return list.find((entry) => entry.id === profileId) ?? list[0];
}

export async function fetchNegativeWithProfile(input: {
  profile?: NegativeProfile;
  hints?: string;
  sport?: string | null;
}): Promise<string | null> {
  const profile = input.profile;
  if (profile?.staticPrompt?.trim()) {
    return profile.staticPrompt.trim();
  }

  const response = await fetch("/api/negative", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hints: input.hints?.trim() || profile?.hints,
      sport: input.sport ?? profile?.sport,
      preserveSubject: profile?.preserveSubject,
      extra: profile?.extra,
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { prompt?: string };
  return data.prompt?.trim() || null;
}
