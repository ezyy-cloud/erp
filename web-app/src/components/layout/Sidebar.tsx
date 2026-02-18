import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  LayoutDashboard, 
  FolderKanban, 
  CheckSquare, 
  Users, 
  BarChart3,
  LogOut,
  ClipboardList
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import logo from '@/assets/ezyy.svg';

export function Sidebar() {
  const { signOut, permissions } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const navItems = [];

  // Dashboard is first for all roles
  navItems.push({
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
  });

  // Bulletin Board is second for all roles
  navItems.push({
    label: 'Bulletin Board',
    path: '/bulletin-board',
    icon: ClipboardList,
  });

  // Build navigation items based on role/permissions
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
    // Regular users only see tasks
    navItems.push({
      label: 'My Tasks',
      path: '/tasks',
      icon: CheckSquare,
    });
  }

  return (
    <aside className="hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:w-64 lg:border-r lg:bg-card lg:h-screen lg:overflow-y-auto lg:z-40 shrink-0">
      <div className="flex flex-col h-full w-full">
        {/* Logo/Brand */}
        <div className="flex items-center gap-2 px-6 py-4 border-b">
          <img src={logo} alt="Ezyy ERP" className="h-8 w-8" />
          <span className="text-lg font-semibold">Ezyy ERP</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200",
                  isActive(item.path)
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:translate-x-1"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <Icon className="h-5 w-5 transition-transform duration-200" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="px-4 py-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </Button>
        </div>
      </div>
    </aside>
  );
}
