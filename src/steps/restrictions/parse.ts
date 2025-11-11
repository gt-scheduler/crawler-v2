import { load } from "cheerio";
import { warn } from "../../log";
import {
  Restriction,
  RestrictionCategory,
  RestrictionValue,
  SectionRestrictions,
} from "../../types";

/**
 * Parses HTML restriction data into structured format
 * @param html - Raw HTML from getRestrictions endpoint
 * @param crn - Course Reference Number (for logging)
 * @param downloadSuccess - Whether the download was successful
 * @returns Restriction data with status
 */
export function parseSectionRestrictions(
  html: string,
  crn: string,
  downloadSuccess: boolean
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
    const restrictions: Restriction[] = [];

    // The HTML structure contains text nodes with restriction rules
    const text = $.text();

    // Split by common patterns
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let currentCategory: RestrictionCategory | null = null;
    let currentAllowed = true;
    const currentValues: RestrictionValue[] = [];

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
      // Check if this is a category header
      if (line.startsWith("Cannot be enrolled")) {
        // Save previous restriction if exists
        if (currentCategory && currentValues.length > 0) {
          restrictions.push({
            allowed: currentAllowed,
            category: currentCategory,
            values: [...currentValues],
          });
          currentValues.length = 0;
        }
        currentAllowed = false;
      } else if (line.startsWith("Must be enrolled")) {
        // Save previous restriction if exists
        if (currentCategory && currentValues.length > 0) {
          restrictions.push({
            allowed: currentAllowed,
            category: currentCategory,
            values: [...currentValues],
          });
          currentValues.length = 0;
        }
        currentAllowed = true;
      }

      // Check for category type
      for (const [pattern, category] of Object.entries(categoryPatterns)) {
        if (line.includes(pattern)) {
          // Save previous restriction if exists
          if (currentCategory && currentValues.length > 0) {
            restrictions.push({
              allowed: currentAllowed,
              category: currentCategory,
              values: [...currentValues],
            });
            currentValues.length = 0;
          }
          currentCategory = category;
          break;
        }
      }

      // Parse restriction values (format: "Name (CODE)")
      const valueMatch = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
      if (valueMatch && currentCategory) {
        currentValues.push({
          name: valueMatch[1].trim(),
          code: valueMatch[2].trim(),
        });
      }
    }

    // Add the last restriction if exists
    if (currentCategory && currentValues.length > 0) {
      restrictions.push({
        allowed: currentAllowed,
        category: currentCategory,
        values: currentValues,
      });
    }

    return {
      restrictions,
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
