import { createRoot } from 'react-dom/client';

import CourseExplorer from '@/app/course-explorer';
import courses from '@/app/courses.json';
import '@/app/globals.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('未找到离线课表挂载节点。');
}

createRoot(root).render(<CourseExplorer initialCourses={courses} />);
