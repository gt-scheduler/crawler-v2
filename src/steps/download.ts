import axios from "axios";
import { concatParams, generateSessionId } from "../utils";

export interface FetchOptions {
  subject?: string;
  course?: string;
  title?: string;
  sessionId?: string;
}

// https://registration.banner.gatech.edu/StudentRegistrationSsb/ssb/searchResults/searchResults?txt_term=202302&
// startDatepicker=&endDatepicker=&uniqueSessionId=adgx71677950276913&pageOffset=0&pageMaxSize=10000&
// sortColumn=subjectDescription&sortDirection=asc
export async function download(
  term: string,
  sessionId?: string,
  options: FetchOptions = {}
): Promise<string> {
  const { subject = "", course = "", title = "" } = options;
  const uniqueSessionId = sessionId ?? generateSessionId();

  const dummyParams = [
    // "sel_subj",
    // "sel_day",
    // "sel_schd",
    // "sel_insm",
    // "sel_camp",
    // "sel_levl",
    // "sel_sess",
    // "sel_instr",
    // "sel_ptrm",
    // "sel_attr",
  ].reduce((acc, dummyKey) => ({ ...acc, [dummyKey]: "dummy" }), {});
  console.log(dummyParams);
  const params = {
    txt_term: "202302",
    startDatepicker: "",
    endDatepicker: "",
    uniqueSessionId: "71shz1677955539314",
    pageOffset: 0,
    pageMaxSize: 500,
    sortColumn: "subjectDescription",
    sortDirection: "asc",
    // sel_subj: subject,
    // sel_crse: course,
    // sel_title: title,
    // sel_schd: "%",
    // sel_from_cred: "",
    // sel_to_cred: "",
    // sel_camp: "%",
    // sel_ptrm: "%",
    // sel_instr: "%",
    // sel_attr: "%",
    // begin_hh: "0",
    // begin_mi: "0",
    // begin_ap: "a",
    // end_hh: "0",
    // end_mi: "0",
    // end_ap: "a",
  };
  const query = [dummyParams, params].map(concatParams).join("&");
  const url = `https://registration.banner.gatech.edu/StudentRegistrationSsb/ssb/searchResults/searchResults?${query}`;
  console.log(url);
  const response = await axios.get<string>(url, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/json",
    },
  });
  console.log(response.data);
  return response.data;
}
