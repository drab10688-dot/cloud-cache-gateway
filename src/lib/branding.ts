// ISP Branding configuration persisted in localStorage
// Used by the public Speed Test page and configurable from admin Settings

export interface BrandingConfig {
  ispName: string;
  logoUrl: string;
  primaryColor: string; // HSL value like "175 80% 45%"
  accentColor: string;
  tagline: string;
  showPoweredBy: boolean;
}

const STORAGE_KEY = "netadmin-branding";

const defaultBranding: BrandingConfig = {
  ispName: "NetAdmin",
  logoUrl: "",
  primaryColor: "175 80% 45%",
  accentColor: "175 60% 35%",
  tagline: "Verifica la velocidad de tu conexión",
  showPoweredBy: true,
};

export function getBranding(): BrandingConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...defaultBranding, ...JSON.parse(stored) };
    }
  } catch {
    // ignore parse errors
  }
  return { ...defaultBranding };
}

export function saveBranding(config: Partial<BrandingConfig>): BrandingConfig {
  const current = getBranding();
  const updated = { ...current, ...config };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function resetBranding(): BrandingConfig {
  localStorage.removeItem(STORAGE_KEY);
  return { ...defaultBranding };
}
