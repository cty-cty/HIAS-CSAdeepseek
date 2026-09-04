import { createRoot } from 'react-dom/client';

import type { Course } from '@/lib/course-tools';
import CourseExplorer from '@/app/course-explorer';
import coursesData from '@/app/courses.json';
import '@/app/globals.css';

const courses = coursesData as Course[];

const root = document.getElementById('root');

if (!root) {
  throw new Error('未找到离线课表挂载节点。');
}

createRoot(root).render(<CourseExplorer initialCourses={courses} />);
