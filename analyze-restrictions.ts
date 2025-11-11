import fs from "fs";
import path from "path";

interface RestrictionValue {
  name: string;
  code: string;
}

interface Restriction {
  allowed: boolean;
  category: string;
  values: RestrictionValue[];
}

interface SectionRestrictions {
  restrictions: Restriction[];
  status: "success" | "parse-error" | "fetch-error";
}

interface Section {
  crn: string;
  restrictions?: Restriction[]; // Old format
  restrictionData?: SectionRestrictions; // New format
}

interface DebugData {
  courses: {
    [courseId: string]: {
      fullName: string;
      sections: {
        [sectionId: string]: Section;
      };
    };
  };
}

// Read the debug JSON file
const debugFilePath = path.join(__dirname, "data", "debug", "202602.json");
const data: DebugData = JSON.parse(fs.readFileSync(debugFilePath, "utf-8"));

// Track restriction categories and their values
const restrictionsByCategory = new Map<string, Map<string, Set<string>>>();
const allDefinedCategories = new Set([
  "College",
  "Campus",
  "Major",
  "Level",
  "Class",
  "Degree",
  "Program",
]);

// Track status counts
let totalSections = 0;
let successCount = 0;
let parseErrorCount = 0;
let fetchErrorCount = 0;
let sectionsWithRestrictions = 0;
let sectionsWithoutRestrictions = 0;

// Process all sections
for (const courseId in data.courses) {
  const course = data.courses[courseId];
  for (const sectionId in course.sections) {
    const section = course.sections[sectionId];
    totalSections++;

    // Handle both old format (restrictions array) and new format (restrictionData object)
    let restrictions: Restriction[];
    let status: "success" | "parse-error" | "fetch-error";

    if (section.restrictionData) {
      // New format with status tracking
      restrictions = section.restrictionData.restrictions;
      status = section.restrictionData.status;
    } else {
      // Old format - just restrictions array
      restrictions = section.restrictions || [];
      status = "success";
    }

    // Track status
    if (status === "success") {
      successCount++;
    } else if (status === "parse-error") {
      parseErrorCount++;
    } else if (status === "fetch-error") {
      fetchErrorCount++;
    }

    // Track restrictions
    if (restrictions.length > 0) {
      sectionsWithRestrictions++;

      for (const restriction of restrictions) {
        const category = restriction.category;

        if (!restrictionsByCategory.has(category)) {
          restrictionsByCategory.set(category, new Map());
        }

        const categoryMap = restrictionsByCategory.get(category)!;
        const allowedKey = restriction.allowed
          ? "Must be enrolled"
          : "Cannot be enrolled";

        if (!categoryMap.has(allowedKey)) {
          categoryMap.set(allowedKey, new Set());
        }

        const valuesSet = categoryMap.get(allowedKey)!;

        for (const value of restriction.values) {
          valuesSet.add(`${value.name} (${value.code})`);
        }
      }
    } else if (status === "success") {
      // Only count as "without restrictions" if status is success and array is empty
      sectionsWithoutRestrictions++;
    }
  }
}

// Print results
console.log("\n=== Restriction Analysis ===\n");
console.log(`Total sections: ${totalSections}`);
console.log(`\nStatus Distribution:`);
console.log(
  `  Success: ${successCount} (${((successCount / totalSections) * 100).toFixed(
    2
  )}%)`
);
console.log(
  `  Parse errors: ${parseErrorCount} (${(
    (parseErrorCount / totalSections) *
    100
  ).toFixed(2)}%)`
);
console.log(
  `  Fetch errors: ${fetchErrorCount} (${(
    (fetchErrorCount / totalSections) *
    100
  ).toFixed(2)}%)`
);
console.log(
  `\nSections with restrictions: ${sectionsWithRestrictions} (${(
    (sectionsWithRestrictions / totalSections) *
    100
  ).toFixed(2)}%)`
);
console.log(
  `Sections without restrictions: ${sectionsWithoutRestrictions} (${(
    (sectionsWithoutRestrictions / totalSections) *
    100
  ).toFixed(2)}%)\n`
);

// Print restriction types
console.log("=== Restriction Types Found ===\n");
const sortedCategories = Array.from(restrictionsByCategory.keys()).sort();

for (const category of sortedCategories) {
  console.log(`\n${category}:`);
  const categoryMap = restrictionsByCategory.get(category)!;

  for (const [allowedType, valuesSet] of categoryMap.entries()) {
    console.log(`  ${allowedType}:`);
    const sortedValues = Array.from(valuesSet).sort();
    for (const value of sortedValues) {
      console.log(`    - ${value}`);
    }
    console.log(`    Total: ${valuesSet.size} classes`);
  }
}

// Check for unused categories
const usedCategories = new Set(restrictionsByCategory.keys());
const unusedCategories = Array.from(allDefinedCategories).filter(
  (cat) => !usedCategories.has(cat)
);

if (unusedCategories.length > 0) {
  console.log("\n=== Unused Restriction Categories ===\n");
  console.log(
    "The following categories are defined but never appear in the data:"
  );
  for (const category of unusedCategories.sort()) {
    console.log(`  - ${category}`);
  }
} else {
  console.log("\n=== All restriction categories are used ===\n");
}
