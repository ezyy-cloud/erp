import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { OfflineIndicator } from '@/components/pwa/OfflineIndicator';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex overflow-x-hidden">
      {/* Offline Indicator */}
      <OfflineIndicator />
      
      {/* Install Prompt */}
      <InstallPrompt />
      
      {/* Desktop Sidebar - Hidden on mobile/tablet */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col w-full min-w-0 lg:ml-64">
        {/* Top Bar - Fixed at top, visible on all screen sizes */}
        <TopBar />

        {/* Page Content - Add top padding to account for fixed header */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pt-14 sm:pt-16 pb-16 lg:pb-0 w-full">
          <div className="w-full max-w-full mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 animate-in fade-in duration-300">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation - Only visible on mobile */}
      <BottomNav />
    </div>
  );
}
