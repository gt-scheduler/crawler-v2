import axios, { AxiosResponse } from "axios";
import asyncPool from "tiny-async-pool";
import { backOff } from "exponential-backoff";

import { concatParams } from "../utils";
import { BannerResponse, SectionResponse } from "../types";
import { error } from "../log";

export interface FetchOptions {
  subject?: string;
  course?: string;
  title?: string;
}

/**
 * Creates a banner search url with an input query.
 * @param query - Banner search query
 */
export function urlBuilder(query: string): string {
  return `https://registration.banner.gatech.edu/StudentRegistrationSsb/ssb/searchResults/searchResults?${query}`;
}

export async function download(
  term: string,
  options: FetchOptions = {}
): Promise<SectionResponse[]> {
  const { subject = "", course = "" } = options;

  const maxAttemptCount = 10;
  let sessionGenerateRes: AxiosResponse;
  // Generates a session cookie for the Banner 9 API for the given term with exponential backoff in case of errors.
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
        numOfAttempts: maxAttemptCount,
        retry: (err, attemptNumber) => {
          error(`an error occurred while generating banner session`, err, {
            term,
            attemptNumber,
            tryingAgain: attemptNumber < maxAttemptCount,
          });
          return true;
        },
      }
    );
    sessionGenerateRes = response;
  } catch (err) {
    error(`exhausted retries for generating banner session`, err, {
      term,
    });
    throw err;
  }

  // Attaches the session cookie generated in the previous step to an axios instance.
  const cookie = sessionGenerateRes.headers["set-cookie"];
  const session = axios.create({
    headers: { Cookie: cookie },
  });

  // Local function to build the query parameters for the Banner course search.
  function buildParams(pageOffset: number, pageMaxSize: number) {
    return {
      txt_term: term,
      txt_subj: subject,
      txt_courseNumber: course,
      startDatepicker: "",
      endDatepicker: "",
      pageOffset,
      pageMaxSize,
      sortColumn: "subjectDescription",
      sortDirection: "asc",
    };
  }

  // Stores the response data of concurrent fetches of course data in an array to prevent race conditions.
  const sectionResponses: SectionResponse[][] = [];

  // Returns a function that fetches course data for a given sectionOffset and pageMaxSize
  function buildGetSectionsFunction(
    pageMaxSize = 500
  ): (sectionOffset: number) => Promise<number> {
    return async function getSectionsPage(
      sectionOffset: number
    ): Promise<number> {
      const params = buildParams(sectionOffset, pageMaxSize);
      const query = concatParams(params);
      const url = urlBuilder(query);

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
            numOfAttempts: maxAttemptCount,
            retry: (err, attemptNumber) => {
              error(`an error occurred while fetching course sections`, err, {
                term,
                sectionOffset,
                pageMaxSize,
                attemptNumber,
                tryingAgain: attemptNumber < maxAttemptCount,
              });
              return true;
            },
          }
        );

        // Appends the response data to sectionResponses if data is not null and it is not the initial
        // request to get total section count. If data is null, it throws an error.
        const bannerResponse = response.data;
        if (bannerResponse.data !== null && pageMaxSize !== 0) {
          sectionResponses.push(bannerResponse.data);
        }
        return bannerResponse.totalCount;
      } catch (err) {
        error(`exhausted retries for fetching course sections`, err, {
          term,
          sectionOffset,
          pageMaxSize,
        });
        throw err;
      }
    };
  }

  // Gets total section count for the given query by performing an initial query to get the first section.
  const totalCount = await buildGetSectionsFunction(0)(1);
  const numThreads = Math.ceil(totalCount / 500);
  // Creates an array of sectionOffset values based on the number of requests required
  const offsetArr = Array<number>(numThreads)
    .fill(0)
    .map((_, i) => 500 * i);

  if (numThreads >= 1) {
    await asyncPool(numThreads, offsetArr, buildGetSectionsFunction());
  }

  // Concatenates all section response data into one array
  const sections: SectionResponse[] = [];
  sectionResponses.forEach((sectionResponse) =>
    sections.push(...sectionResponse)
  );

  return sections;
}
