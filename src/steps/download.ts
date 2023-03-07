import axios, { AxiosInstance } from "axios";
import { backOff } from "exponential-backoff";

import { concatParams } from "../utils";
import { BannerResponse, SectionResponse } from "../types";
import { error } from "../log";

export const MAX_PAGE_SIZE = 500;
export const MAX_ATTEMPT_COUNT = 10;

export interface FetchOptions {
  subject?: string;
  course?: string;
  title?: string;
}

export interface SectionsPage {
  sections: SectionResponse[];
  totalCount: number;
}

export function buildParamsCurry(
  term: string,
  subject: string,
  course: string,
  pageMaxSize: number
): (pageOffset: number) => Record<string, string> {
  return function buildParams(pageOffset: number) {
    return {
      txt_term: term,
      txt_subj: subject,
      txt_courseNumber: course,
      startDatepicker: "",
      endDatepicker: "",
      pageOffset: pageOffset.toString(),
      pageMaxSize: pageMaxSize.toString(),
      sortColumn: "subjectDescription",
      sortDirection: "asc",
    };
  };
}

/**
 * Creates a banner search url with an input query.
 * @param query - Banner search query
 */
export function searchUrlBuilder(query: string): string {
  return `https://registration.banner.gatech.edu/StudentRegistrationSsb/ssb/searchResults/searchResults?${query}`;
}

/**
 * Generates a session cookie for the Banner 9 API for the given term with exponential backoff in case of errors.
 * @param term - The term whose session is created
 */
export async function generateSearchSessionCookie(
  term: string
): Promise<string[]> {
  try {
    const response = await backOff(
      () =>
        axios
          .post(
            "https://registration.banner.gatech.edu/StudentRegistrationSsb/ssb/term/search?mode=search",
            { term },
            {
              headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UT",
              },
            }
          )
          .then((res) => {
            if (res.headers["set-cookie"] === undefined) {
              throw new Error("Null session cookie generated");
            }
            return res;
          }),
      {
        // See https://github.com/coveooss/exponential-backoff for options API.
        jitter: "full",
        numOfAttempts: MAX_ATTEMPT_COUNT,
        retry: (err, attemptNumber) => {
          error(`an error occurred while generating banner session`, err, {
            term,
            attemptNumber,
            tryingAgain: attemptNumber < MAX_ATTEMPT_COUNT,
          });
          return true;
        },
      }
    );

    const cookie = response.headers["set-cookie"];
    if (cookie === undefined) {
      throw new Error("Null session cookie generated");
    }
    return cookie;
  } catch (err) {
    error(`exhausted retries for generating banner session`, err, {
      term,
    });
    throw err;
  }
}

// Returns a function that fetches course data for a given query, sectionOffset, and pageMaxSize
function getSectionsPageCurry(
  session: AxiosInstance,
  pageMaxSize: number,
  term: string,
  subject: string,
  course: string
): (sectionOffset: number) => Promise<SectionsPage> {
  // Function to build the query parameters for the Banner course search.
  const buildParams = buildParamsCurry(term, subject, course, pageMaxSize);

  return async function getSectionsPage(
    sectionOffset: number
  ): Promise<SectionsPage> {
    const params = buildParams(sectionOffset);
    const query = concatParams(params);
    const url = searchUrlBuilder(query);

    try {
      const response = await backOff(
        () =>
          session.get<BannerResponse>(url).then((res) => {
            if (res.data.data === null) {
              throw new Error("Fetched null data");
            }
            return res;
          }),
        {
          // See https://github.com/coveooss/exponential-backoff for options API
          jitter: "full",
          numOfAttempts: MAX_ATTEMPT_COUNT,
          retry: (err, attemptNumber) => {
            error(`an error occurred while fetching course sections`, err, {
              term,
              subject,
              course,
              sectionOffset,
              pageMaxSize,
              attemptNumber,
              tryingAgain: attemptNumber < MAX_ATTEMPT_COUNT,
            });
            return true;
          },
        }
      );

      const bannerResponse = response.data;
      if (bannerResponse.data === null) {
        throw new Error("Fetched null data");
      }

      return {
        sections: bannerResponse.data,
        totalCount: bannerResponse.totalCount,
      };
    } catch (err) {
      error(`exhausted retries for fetching course sections`, err, {
        term,
        subject,
        course,
        sectionOffset,
        pageMaxSize,
      });
      throw err;
    }
  };
}

export async function download(
  term: string,
  options: FetchOptions = {}
): Promise<SectionResponse[]> {
  const { subject = "", course = "" } = options;

  // Generates and attaches a session cookie for the given term to an axios instance.
  const cookie = await generateSearchSessionCookie(term);
  const session = axios.create({
    headers: { Cookie: cookie },
  });

  // Gets total section count for the given query by fetching one section.
  const getFirstSection = getSectionsPageCurry(
    session,
    0,
    term,
    subject,
    course
  );
  const { totalCount } = await getFirstSection(1);
  const numThreads = Math.ceil(totalCount / MAX_PAGE_SIZE);
  // Creates an array of sectionOffset values based on the number of requests required
  const offsetArr = Array<number>(numThreads)
    .fill(0)
    .map((_, i) => MAX_PAGE_SIZE * i);

  // Stores the response data of the concurrent fetches of course data in an array
  let sectionsPages: SectionsPage[] = [];

  if (numThreads >= 1) {
    const getSectionsPage = getSectionsPageCurry(
      session,
      MAX_PAGE_SIZE,
      term,
      subject,
      course
    );
    sectionsPages = await Promise.all(
      offsetArr.map(async (pageOffset) => getSectionsPage(pageOffset))
    );
  }

  // Concatenates all section pages into one array
  const sections: SectionResponse[] = [];
  sectionsPages.forEach((sectionsPage) =>
    sections.push(...sectionsPage.sections)
  );

  return sections;
}
