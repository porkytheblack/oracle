"use client";

import { GloveProvider } from "glove-react";
import { gloveClient } from "@/lib/glove";
import { SectionViewerProvider } from "@/lib/section-viewer";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SectionViewerProvider>
      <GloveProvider client={gloveClient}>{children}</GloveProvider>
    </SectionViewerProvider>
  );
}
