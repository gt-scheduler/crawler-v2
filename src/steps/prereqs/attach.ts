import { TermData, Prerequisites } from "../../types";

/**
 * Attaches course prerequisites to the data for the current term in-place
 * (*mutates the termData parameter*).
 * @param termData - Term data for all courses as parsed in previous steps
 * @param prerequisites - Section CRN -> prerequisites map as parsed in previous steps
 */
export function attachPrereqs(
  termData: TermData,
  prerequisites: Record<string, Prerequisites>
): void {
  // For each parsed prerequisite,
  // attach it to the corresponding course
  // (mutate in-place)
  Object.keys(termData.courses).forEach((courseId) => {
    Object.keys(termData.courses[courseId][1]).forEach((sectionLetter) => {
      const termDataCrn = termData.courses[courseId][1][sectionLetter][0];
      if (termDataCrn in prerequisites) {
        // eslint-disable-next-line no-param-reassign
        termData.courses[courseId][1][sectionLetter][8] =
          prerequisites[termDataCrn];
      }
    });
  });
}
