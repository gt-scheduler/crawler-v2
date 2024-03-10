import fs from "fs";
import _ from "lodash";
import hash from "object-hash";
import { Course, Section, TermData } from "../types";

const TEST_FILE = "./data/202308.json";

/**
 * Function for comparing a course's sections' prerequisites
 */
const compareSectionPrereqs = (course: Course): boolean => {
  const sectionKeys = Object.keys(course[1]);
  const basisSection = sectionKeys?.[0];
  const basis = course[1]?.[basisSection]?.[8];
  if (!basis) {
    return false;
  }

  for (let i = 1; i < sectionKeys.length; i++) {
    if (!_.isEqual(basis, course[1][sectionKeys[i]][8])) {
      return false;
    }
  }
  return true;
};

const data: TermData = JSON.parse(fs.readFileSync(TEST_FILE, "utf-8"));

/**
 * Check all courses for unique section prerequisites
 */
const processedCourses = Object.keys(data.courses).map((course) => ({
  courseId: course,
  course: data.courses[course],
  result: compareSectionPrereqs(data.courses[course]),
}));

/**
 * Collate list of courses with different section prerequisites
 */
const coursesWithUniqueSections = processedCourses.filter(
  (course) => !course.result
);

type ValidObj = {
  [prof: string]: {
    [courseId: string]: {
      [prereqHash: string]: Section[];
    };
  };
};

const profCourses: ValidObj = {};

/**
 * Map professors to unique prerequisites using a nested hashmap
 *
 * Mapping: professor -> course -> hashed prerequisite -> sections
 *
 * If there are multiple hash keys per course, this means the professor
 * has sections with different prerequisites in the same course
 */
coursesWithUniqueSections.forEach((courseContainer) => {
  const { courseId, course } = courseContainer;
  const sections = course[1];
  Object.keys(sections).forEach((sectionId) => {
    const section = sections[sectionId];

    const profs = section[1][0][4];
    let prof;
    if (profs.length > 1) {
      const primaryProf = profs.filter((profTemp) => {
        const splitRes = profTemp.split(" ");
        return splitRes[splitRes.length - 1] === "(P)";
      })[0];
      prof = primaryProf;
    } else {
      [prof] = profs;
    }
    const prereqHash = hash(course[1][sectionId][8]);

    // Basically behaves like a Python defaultdict
    profCourses[prof] = {
      ...profCourses[prof],
      [courseId]: {
        ...profCourses[prof]?.[courseId],
        [prereqHash]: [
          ...(profCourses[prof]?.[courseId]?.[prereqHash] ?? []),
          section,
        ],
      },
    };
  });
});

/**
 * Parse the nested hashmap to isolate courses with sections requiring
 * different prerequisites
 */
const filteredProfCourses: ValidObj = {};
let profUniqueSectionCount = 0;
Object.keys(profCourses).forEach((prof) => {
  Object.keys(profCourses[prof]).forEach((courseId) => {
    const prereqObj = profCourses[prof][courseId];
    const hashes = Object.keys(prereqObj);
    if (hashes.length > 1) {
      filteredProfCourses[prof] = {
        ...filteredProfCourses[prof],
        [courseId]: prereqObj,
      };
      profUniqueSectionCount += 1;
    }
    // Object.keys(profCourses[prof][courseId]).forEach((prereqHash) => {
    //   const sections = profCourses[prof][courseId][prereqHash];
    //   if (sections.length > 1) {
    //     filteredProfCourses[prof] = {
    //       ...filteredProfCourses[prof],
    //       [courseId]: {
    //         ...filteredProfCourses[prof]?.[courseId],
    //         [prereqHash]: sections,
    //       },
    //     };
    //   }
    // });
  });
});
coursesWithUniqueSections.filter((profObj) => profObj);

fs.writeFileSync(
  "./data/diff_prereqs.json",
  JSON.stringify(filteredProfCourses, null, 2)
  // JSON.stringify({ filteredProfCourses, coursesWithUniqueSections }, null, 2)
);

console.log(
  `Number of courses where professor has sections with different prerequisites: ${profUniqueSectionCount}`
);
