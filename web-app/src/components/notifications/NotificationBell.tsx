import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/contexts/NotificationContext';
import { NotificationList } from './NotificationList';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { unreadCount } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-10 w-10 p-0"
        aria-label="Notifications"
      >
        <Bell className="h-8 w-8" />
        {unreadCount > 0 && (
          <span
            className={cn(
              'absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-white',
              unreadCount > 99 ? 'px-1 text-[10px]' : ''
            )}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>
      {isOpen && (
        <>
          {/* Mobile backdrop overlay */}
          <div 
            className="fixed inset-0 bg-black/50 z-[150] lg:hidden"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          {/* Notification dropdown */}
          <div className="fixed lg:absolute right-0 lg:right-0 top-14 sm:top-16 lg:top-full lg:mt-2 w-screen max-w-[calc(100vw-2rem)] sm:max-w-sm lg:w-96 z-[200] lg:z-50 mx-4 sm:mx-0 lg:mx-0">
            <NotificationList onClose={() => setIsOpen(false)} />
          </div>
        </>
      )}
    </div>
  );
}
