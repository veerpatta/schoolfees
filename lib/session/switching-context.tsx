"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

type SwitchingContextValue = {
  isSwitching: boolean;
  setIsSwitching: (value: boolean) => void;
};

const SwitchingContext = createContext<SwitchingContextValue>({
  isSwitching: false,
  setIsSwitching: () => {},
});

export function SessionSwitchingProvider({ children }: { children: ReactNode }) {
  const [isSwitching, setIsSwitching] = useState(false);
  const value = useMemo(
    () => ({ isSwitching, setIsSwitching }),
    [isSwitching],
  );

  return (
    <SwitchingContext.Provider value={value}>
      {children}
    </SwitchingContext.Provider>
  );
}

export function useSessionSwitching() {
  return useContext(SwitchingContext);
}
