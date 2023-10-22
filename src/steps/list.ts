import axios from "axios";
import { getIntConfig } from "../utils";

const NUM_TERMS = getIntConfig("NUM_TERMS") ?? 2;

export type TermData = {
  code: string;
  description: string;
};

export async function list(): Promise<[string[], string[]]> {
  const queryNum = 3 * NUM_TERMS + 10;

  const response = await axios.post<TermData[]>(
    `https://registration.banner.gatech.edu/StudentRegistrationSsb/ssb/courseSearch/getTerms?searchTerm=&offset=1&max=${queryNum}`
  );
  const responseFinalized = await axios.post<TermData[]>(
    `https://registration.banner.gatech.edu/StudentRegistrationSsb/ssb/classSearch/getTerms?searchTerm=&offset=1&max=${queryNum}`
  );

  const terms = response.data.map((term) => term.code);
  const termsFinalized = responseFinalized.data.map((term) => term.code);

  const results = terms.filter((term) => {
    const month = Number(term.slice(4));
    return month >= 1 && month <= 12;
  });

  return [results, termsFinalized];
}
