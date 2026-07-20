"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalPortalProps = {
  children: ReactNode;
};

/** Renders children on document.body so fixed overlays sit above the app sidebar. */
export default function ModalPortal({ children }: ModalPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return createPortal(children, document.body);
}
