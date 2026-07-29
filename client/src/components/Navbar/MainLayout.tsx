import { Outlet } from 'react-router-dom';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
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
      {/* Desktop only (CSS-hidden below md) — pinned to the corner rather than
          a page-by-page header addition, since not every page here (Home,
          Settings, Friends…) has the same header shape, and this way it's one
          spot instead of N. Mobile already has its own toggle in the nav
          drawer, independent of this. */}
      <ThemeToggle className="app-shell__theme-toggle" />
    </div>
  );
}
