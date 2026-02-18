import { useLocation, useNavigate } from 'react-router-dom';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { usePage } from '@/contexts/PageContext';
import { UserAvatar } from '@/components/users/UserAvatar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/bulletin-board': 'Bulletin Board',
  '/tasks': 'Tasks',
  '/projects': 'Projects',
  '/users': 'User Management',
  '/reports': 'Reports',
  '/profile': 'Profile',
};

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { actionButton, backButton } = usePage();
  const { user } = useAuth();
  
  // Get page title from route
  const getPageTitle = () => {
    // Check exact match first
    if (pageTitles[location.pathname]) {
      return pageTitles[location.pathname];
    }
    // Check for dynamic routes
    if (location.pathname.startsWith('/tasks/')) {
      return 'Task Detail';
    }
    if (location.pathname.startsWith('/projects/')) {
      return 'Project Detail';
    }
    if (location.pathname.startsWith('/users/')) {
      return 'User Performance';
    }
    return 'Dashboard';
  };

  const pageTitle = getPageTitle();

  return (
    <header className="flex fixed top-0 left-0 lg:left-64 right-0 z-[100] h-14 sm:h-16 border-b bg-card backdrop-blur-md shadow-sm items-center justify-between px-4 sm:px-6 w-full lg:w-[calc(100%-16rem)] shrink-0 safe-area-top">
      {/* Back button and Page title - visible on all screen sizes */}
      <div className="flex items-center gap-2 sm:gap-4">
        {backButton}
        <h1 className="text-lg sm:text-xl font-semibold">{pageTitle}</h1>
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Notification bell */}
        <div className="flex items-center gap-2 sm:gap-4">
          <NotificationBell />
        </div>
        {/* Action button - visible on all screen sizes if available */}
        {actionButton && (
          <div className="flex items-center gap-2">
            {actionButton}
          </div>
        )}
        {/* User Avatar - links to profile */}
        {user && (
          <Button
            variant="ghost"
            size="sm"
            className="h-12 w-12 p-0 rounded-full"
            onClick={() => navigate('/profile')}
            aria-label="View profile"
          >
            <UserAvatar size="lg" />
          </Button>
        )}
      </div>
    </header>
  );
}
