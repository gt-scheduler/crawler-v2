import axios from "axios";
import { backOff } from "exponential-backoff";
import { concatParams } from "../utils";
import { warn, error } from "../log";
import { SectionId } from "../types";

/**
 * Downloads the course detail information for a single course
 * @param term - The term string
 * @param sectionId - Object containing all information about section (subject, number, section letter, CRN)
 */
export async function downloadCourseDetails(
  term: string,
  sectionId: SectionId
): Promise<string> {
  if (!(sectionId.subject && sectionId.number)) {
    warn("invalid section ID; skipping detail scraping", sectionId);
    return "";
  }

  const { subject, number } = sectionId;
  const parameters = {
    term,
    subjectCode: subject,
    courseNumber: number,
  };

  const query = `?${concatParams(parameters)}`;
  const url = `https://registration.banner.gatech.edu/StudentRegistrationSsb/ssb/courseSearchResults/getCourseDescription${query}`;

  // Perform the request in a retry loop
  // (sometimes, we get rate limits/transport errors so this tries to mitigates them)
  const maxAttemptCount = 10;
  try {
    const response = await backOff(
      () =>
        axios.get<string>(url, {
          headers: {
            "User-Agent": "gt-scheduler/crawler",
          },
        }),
      {
        // See https://github.com/coveooss/exponential-backoff for options API
        jitter: "full",
        numOfAttempts: maxAttemptCount,
        retry: (err, attemptNumber) => {
          error(`an error occurred while fetching details`, err, {
            sectionId,
            url,
            attemptNumber,
            tryingAgain: attemptNumber < maxAttemptCount,
          });
          return true;
        },
      }
    );
    return response.data;
  } catch (err) {
    error(`exhausted retries for fetching details`, err, sectionId);
    throw err;
  }
}

/**
 * Downloads the prerequisites for a single course
 * @param term - The term string
 * @param sectionId - Object containing all information about section (subject, number, section letter, CRN)
 */
export async function downloadCoursePrereqDetails(
  term: string,
  sectionId: SectionId
): Promise<string> {
  if (!(sectionId.subject && sectionId.number)) {
    warn("invalid section ID; skipping detail scraping", sectionId);
    return "";
  }

  const { subject, number, crn } = sectionId;
  const parameters = {
    term,
    subjectCode: subject,
    courseNumber: number,
    courseReferenceNumber: crn,
  };
  const query = `?${concatParams(parameters)}`;

  // Use API endpoint for getting prerequisite information from CRN
  const url = `https://registration.banner.gatech.edu/StudentRegistrationSsb/ssb/searchResults/getSectionPrerequisites${query}`;

  // Perform the request in a retry loop
  // (sometimes, we get rate limits/transport errors so this tries to mitigates them)
  const maxAttemptCount = 10;
  try {
    const response = await backOff(
      () =>
        axios.get<string>(url, {
          headers: {
            "User-Agent": "gt-scheduler/crawler",
          },
        }),
      {
        // See https://github.com/coveooss/exponential-backoff for options API
        jitter: "full",
        numOfAttempts: maxAttemptCount,
        retry: (err, attemptNumber) => {
          error(`an error occurred while fetching details`, err, {
            sectionId,
            url,
            attemptNumber,
            tryingAgain: attemptNumber < maxAttemptCount,
          });
          return true;
        },
      }
    );
    return response.data;
  } catch (err) {
    error(`exhausted retries for fetching prereqs`, err, sectionId);
    throw err;
  }
}

/**
 * Attempts to split a course ID into its subject/number components
 * @param courseId - The joined course id (SUBJECT NUMBER); i.e. `"CS 2340"`
 */
export function splitCourseId(
  courseId: string
): [subject: string, number: string] | null {
  const splitResult = courseId?.split(" ");
  // 'ECON 4803 <123456>' is valid due to sections potentially having different titles or prerequisites
  // Number within arrow brackets signifies CRN as an additional course identifier
  if (!splitResult || splitResult.length !== 2) return null;
  return [splitResult[0], splitResult[1]];
}
