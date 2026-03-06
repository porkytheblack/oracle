"use client";

import { createContext, useContext, useState, useCallback } from "react";

export interface ViewableSection {
  id: string;
  title: string;
  content: string;
}

interface SectionViewerContextValue {
  activeSection: ViewableSection | null;
  open: (section: ViewableSection) => void;
  close: () => void;
}

const SectionViewerContext = createContext<SectionViewerContextValue>({
  activeSection: null,
  open: () => {},
  close: () => {},
});

export function SectionViewerProvider({ children }: { children: React.ReactNode }) {
  const [activeSection, setActiveSection] = useState<ViewableSection | null>(null);

  const open = useCallback((section: ViewableSection) => {
    setActiveSection(section);
  }, []);

  const close = useCallback(() => {
    setActiveSection(null);
  }, []);

  return (
    <SectionViewerContext.Provider value={{ activeSection, open, close }}>
      {children}
    </SectionViewerContext.Provider>
  );
}

export function useSectionViewer() {
  return useContext(SectionViewerContext);
}
