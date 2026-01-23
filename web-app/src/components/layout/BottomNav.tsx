import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  LayoutDashboard,
  FolderKanban, 
  CheckSquare, 
  Users, 
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const { permissions } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [];

  // Dashboard is first for all users
  navItems.push({
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
  });

  // Build navigation items based on permissions
  // Use permissions as the primary check since role might be a string
  if (permissions.canViewAllProjects) {
    navItems.push(
      {
        label: 'Projects',
        path: '/projects',
        icon: FolderKanban,
      },
      {
        label: 'Tasks',
        path: '/tasks',
        icon: CheckSquare,
      }
    );

    if (permissions.canViewAllUsers) {
      navItems.push({
        label: 'Users',
        path: '/users',
        icon: Users,
      });
    }

    if (permissions.canViewReports) {
      navItems.push({
        label: 'Reports',
        path: '/reports',
        icon: BarChart3,
      });
    }
  } else {
    // Regular users see Dashboard and Tasks
    navItems.push({
      label: 'Tasks',
      path: '/tasks',
      icon: CheckSquare,
    });
  }

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 border-t bg-card z-50 safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-full overflow-x-hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all duration-200",
                isActive(item.path)
                  ? "text-primary border-t-2 border-primary scale-105"
                  : "text-muted-foreground hover:text-foreground active:scale-95"
              )}
            >
              <Icon className="h-5 w-5 transition-transform duration-200" />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
