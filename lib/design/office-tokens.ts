export const officeDesignTokens = {
  surface: {
    background: { cssVariable: "--background", role: "Page background" },
    foreground: { cssVariable: "--foreground", role: "Primary text" },
    card: { cssVariable: "--card", role: "Raised panels" },
    surface2: { cssVariable: "--surface-2", role: "Inset panels and table bands" },
    surface3: { cssVariable: "--surface-3", role: "Pressed and deeper inset states" },
  },
  action: {
    primary: { cssVariable: "--primary", role: "Main save and confirm actions" },
    accent: { cssVariable: "--accent", role: "Single highlighted action or focus" },
    ring: { cssVariable: "--ring", role: "Keyboard focus ring" },
  },
  status: {
    success: { cssVariable: "--success", role: "Completed and healthy states" },
    warning: { cssVariable: "--warning", role: "Review and setup-needed states" },
    destructive: { cssVariable: "--destructive", role: "Blocked or destructive states" },
    info: { cssVariable: "--info", role: "Neutral system information" },
  },
  geometry: {
    radius: { cssVariable: "--radius", role: "Default office panel radius" },
    radiusSm: { cssVariable: "--radius-sm", role: "Compact badges and controls" },
    radiusMd: { cssVariable: "--radius-md", role: "Buttons and inputs" },
  },
} as const;

export type OfficeDesignTokenGroup = keyof typeof officeDesignTokens;
