import type { Course } from '@/lib/course-tools';
import CourseExplorer from './course-explorer';
import coursesData from './courses.json';

const courses = coursesData as Course[];

export default function Home() {
  return <CourseExplorer initialCourses={courses} />;
}
