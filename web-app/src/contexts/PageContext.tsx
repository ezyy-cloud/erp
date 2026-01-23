import { createContext, useContext, useState, type ReactNode } from 'react';

interface PageContextType {
  actionButton: ReactNode | null;
  setActionButton: (button: ReactNode | null) => void;
  backButton: ReactNode | null;
  setBackButton: (button: ReactNode | null) => void;
}

const PageContext = createContext<PageContextType | undefined>(undefined);

export function PageProvider({ children }: { children: ReactNode }) {
  const [actionButton, setActionButton] = useState<ReactNode | null>(null);
  const [backButton, setBackButton] = useState<ReactNode | null>(null);

  return (
    <PageContext.Provider value={{ actionButton, setActionButton, backButton, setBackButton }}>
      {children}
    </PageContext.Provider>
  );
}

export function usePage() {
  const context = useContext(PageContext);
  if (context === undefined) {
    throw new Error('usePage must be used within a PageProvider');
  }
  return context;
}
