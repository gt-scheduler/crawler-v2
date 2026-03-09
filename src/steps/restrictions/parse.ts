import { load } from "cheerio";
import { warn } from "../../log";
import {
  Caches,
  Restriction,
  RestrictionCategory,
  SectionRestrictions,
} from "../../types";
import { cache } from "../../utils";

/**
 * Parses HTML restriction data into structured format
 * @param html - Raw HTML from getRestrictions endpoint
 * @param crn - Course Reference Number (for logging)
 * @param downloadSuccess - Whether the download was successful
 * @param caches - The global caches object to store and index string values
 * @returns Restriction data with status
 */
export function parseSectionRestrictions(
  html: string,
  crn: string,
  downloadSuccess: boolean,
  caches: Caches
): SectionRestrictions {
  // If download failed, return fetch-error status
  if (!downloadSuccess) {
    return {
      restrictions: [],
      status: "fetch-error",
    };
  }

  if (!html || html.trim().length === 0) {
    // Empty HTML means no restrictions (successful fetch, no data)
    return {
      restrictions: [],
      status: "success",
    };
  }

  try {
    const $ = load(html);
    const allowed: Restriction[] = [];
    const disallowed: Restriction[] = [];
    // const restrictions: Restriction[] = [];

    // The HTML structure contains text nodes with restriction rules
    const text = $.text();

    // Split by common patterns
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let currentCategory: RestrictionCategory | null = null;
    let currentAllowed = true;
    // const currentValues: RestrictionValue[] = [];

    const categoryPatterns: Record<string, RestrictionCategory> = {
      College: "College",
      Campus: "Campus",
      Major: "Major",
      Level: "Level",
      Class: "Class",
      Degree: "Degree",
      Program: "Program",
    };

    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      // 1. Is this line a header?
      let isHeader =
        lowerLine.startsWith("cannot be enrolled") ||
        lowerLine.startsWith("must be enrolled") ||
        line.endsWith(":");

      // Check if the line is exactly a standalone category name (e.g., "Colleges", "Major")
      const cleanWord = lowerLine.replace(/[^a-z]/g, "");
      const isStandaloneCategory = [
        "college",
        "colleges",
        "campus",
        "campuses",
        "major",
        "majors",
        "class",
        "classes",
        "level",
        "levels",
        "degree",
        "degrees",
        "program",
        "programs",
      ].includes(cleanWord);

      if (isStandaloneCategory) {
        isHeader = true;
      }

      if (isHeader) {
        // --- HEADER LOGIC ---

        // Update allowance rule
        if (lowerLine.startsWith("cannot be enrolled")) {
          currentAllowed = false;
        } else if (lowerLine.startsWith("must be enrolled")) {
          currentAllowed = true;
        }

        // Extract the new category from the header
        for (const [pattern, category] of Object.entries(categoryPatterns)) {
          if (lowerLine.includes(pattern.toLowerCase())) {
            currentCategory = category as RestrictionCategory;
            break;
          }
        }
      } else if (currentCategory) {
        // --- VALUE LOGIC ---
        // (We only enter this block if it's NOT a header AND we have a known category)

        const valueMatch = line.match(/^(.+?)(?:\s*\(([^)]+)\))?\s*$/);

        if (valueMatch) {
          const valueName = valueMatch[1].trim();
          const categoryIdx = cache(caches.restrictions, currentCategory);

          let targetCache: string[] | null = null;

          switch (currentCategory) {
            case "College":
              targetCache = caches.colleges;
              break;
            case "Campus":
              targetCache = caches.campuses;
              break;
            case "Major":
              targetCache = caches.majors;
              break;
            case "Level":
              targetCache = caches.levels;
              break;
            case "Class":
              targetCache = caches.classes;
              break;
            case "Degree":
              targetCache = caches.degrees;
              break;
            case "Program":
              targetCache = caches.programs;
              break;
            default:
              break;
          }

          // Only push to the arrays if we successfully mapped to a target cache
          // (This replaces the old "default: continue" rule)
          if (targetCache) {
            const valueIdx = cache(targetCache, valueName);
            const restrictionTuple: Restriction = [categoryIdx, valueIdx];

            if (currentAllowed) {
              allowed.push(restrictionTuple);
            } else {
              disallowed.push(restrictionTuple);
            }
          }
        }
      }
    }

    const finalRestrictions: [Restriction[], Restriction[]] | [] =
      allowed.length > 0 || disallowed.length > 0 ? [allowed, disallowed] : [];

    return {
      restrictions: finalRestrictions,
      status: "success",
    };
  } catch (err) {
    warn(`failed to parse restrictions`, { crn, error: String(err) });
    return {
      restrictions: [],
      status: "parse-error",
    };
  }
}
