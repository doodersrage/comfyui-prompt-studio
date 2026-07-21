"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalPortalProps = {
  children: ReactNode;
};

const emptySubscribe = () => () => {};

/** Renders children on document.body so fixed overlays sit above the app sidebar. */
export default function ModalPortal({ children }: ModalPortalProps) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return null;
  }

  return createPortal(children, document.body);
}
