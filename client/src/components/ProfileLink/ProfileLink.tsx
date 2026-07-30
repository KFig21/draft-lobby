import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './ProfileLink.scss';

/**
 * Links a username/avatar to that user's profile page. Renders children
 * plainly (no link) when there's no user id — some rows (system messages,
 * missing profiles) legitimately have no one to link to. `stopPropagation`
 * keeps a click from also triggering an enclosing row/card handler.
 */
export function ProfileLink({
  userId,
  className,
  children,
}: {
  userId: string | null | undefined;
  className?: string;
  children: ReactNode;
}) {
  if (!userId) return <>{children}</>;
  return (
    <Link
      to={`/profile/${userId}`}
      className={`profile-link${className ? ` ${className}` : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}
