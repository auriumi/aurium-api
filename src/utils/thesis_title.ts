const MINOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "if",
  "in",
  "nor",
  "of",
  "on",
  "or",
  "per",
  "so",
  "the",
  "to",
  "up",
  "via",
  "yet",
]);

const INTENTIONAL_CASE = new Map([
  ["ai", "AI"],
  ["api", "API"],
  ["covid-19", "COVID-19"],
  ["css", "CSS"],
  ["ehealth", "eHealth"],
  ["elearning", "eLearning"],
  ["html", "HTML"],
  ["ict", "ICT"],
  ["iot", "IoT"],
  ["it", "IT"],
  ["lgbtq+", "LGBTQ+"],
  ["stem", "STEM"],
  ["tvl", "TVL"],
  ["ui", "UI"],
  ["um", "UM"],
]);

// Add organization-specific proper names here when their official casing
// cannot be derived from ordinary APA title-case rules.
const PROTECTED_PHRASES = [
  "City of Davao",
  "Davao de Oro",
  "Davao del Norte",
  "Davao del Sur",
  "Davao Occidental",
  "Davao Oriental",
  "Island Garden City of Samal",
  "Santo Tomas",
  "University of Mindanao",
];

const WORD_PART_PATTERN = /^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9+]*?)$/;
const SUBTITLE_SEPARATOR_PATTERN = /[:?!\u2013\u2014]$/;

function capitalizeWord(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function hasIntentionalMixedCase(word: string) {
  return (
    /[a-z]/.test(word) &&
    /[A-Z]/.test(word) &&
    !/^[A-Z][a-z]+(?:'[a-z]+)?$/.test(word)
  );
}

function formatWordCore(core: string, forceCapitalize: boolean, isLastWord: boolean) {
  const configuredCase = INTENTIONAL_CASE.get(core.toLowerCase());
  if (configuredCase) {
    return configuredCase;
  }

  if (hasIntentionalMixedCase(core)) {
    return core;
  }

  const parts = core.split("-");
  return parts
    .map((part) => {
      if (!part) {
        return part;
      }

      const partConfiguredCase = INTENTIONAL_CASE.get(part.toLowerCase());
      if (partConfiguredCase) {
        return partConfiguredCase;
      }

      if (hasIntentionalMixedCase(part)) {
        return part;
      }

      const shouldCapitalize =
        forceCapitalize ||
        isLastWord ||
        !MINOR_WORDS.has(part.toLowerCase());

      return shouldCapitalize ? capitalizeWord(part) : part.toLowerCase();
    })
    .join("-");
}

function restoreProtectedPhrases(title: string) {
  return PROTECTED_PHRASES.reduce((result, phrase) => {
    const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return result.replace(new RegExp(escapedPhrase, "gi"), phrase);
  }, title);
}

export function formatApaThesisTitle(value: unknown) {
  const normalized =
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!normalized) {
    return "";
  }

  const words = normalized.split(" ");
  let capitalizeNext = true;

  const formatted = words.map((word, index) => {
    const match = word.match(WORD_PART_PATTERN);
    if (!match) {
      return word;
    }

    const [, prefix = "", core = "", suffix = ""] = match;
    if (!core) {
      capitalizeNext = SUBTITLE_SEPARATOR_PATTERN.test(word);
      return word;
    }

    const isLastWord = index === words.length - 1;
    const formattedCore = formatWordCore(core, capitalizeNext, isLastWord);
    capitalizeNext = SUBTITLE_SEPARATOR_PATTERN.test(`${core}${suffix}`);

    return `${prefix}${formattedCore}${suffix}`;
  });

  return restoreProtectedPhrases(formatted.join(" "));
}
