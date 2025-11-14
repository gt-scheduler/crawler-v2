import { TermData } from "../../types";
import findUniquePrereqs from "../../utils/findUniquePrereqs";

export default function categorizePrereqs(data: TermData): void {
  const { allUniqueCourses, profUniqueCourses } = findUniquePrereqs(data);
  const allCourseIds = Object.keys(data.courses);
  allCourseIds.forEach((courseId) => {
    if (profUniqueCourses.includes(courseId)) {
      // eslint-disable-next-line no-param-reassign
      data.courses[courseId][3] = 2;
    } else if (allUniqueCourses.includes(courseId)) {
      // eslint-disable-next-line no-param-reassign
      data.courses[courseId][3] = 1;
    } else {
      // eslint-disable-next-line no-param-reassign
      data.courses[courseId][3] = 0;
    }
  });
}
