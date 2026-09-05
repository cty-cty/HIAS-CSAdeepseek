import CourseExplorer from './course-explorer';
import courses from './courses.json';

export default function Home() {
  return <CourseExplorer initialCourses={courses} />;
}
