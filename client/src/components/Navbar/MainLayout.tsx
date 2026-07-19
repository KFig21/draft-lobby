import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import './MainLayout.scss';

/** App shell for the main signed-in pages: desktop sidebar + mobile bottom bar. */
export function MainLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__content">
        <Outlet />
      </div>
      <Navbar />
    </div>
  );
}
