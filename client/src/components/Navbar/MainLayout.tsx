import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import './MainLayout.scss';

/** App shell for the main signed-in pages: top navbar + mobile bottom bar. */
export function MainLayout() {
  return (
    <div className="app-shell">
      <Navbar />
      <div className="app-shell__content">
        <Outlet />
      </div>
    </div>
  );
}
