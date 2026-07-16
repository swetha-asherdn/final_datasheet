import type { DatasheetLayoutDensity, DatasheetLayoutMode } from "@/server/datasheet/technical-text";

export type DatasheetTemplateDefaults = {
  logoAssetPath: string;
  companyName: string;
  website: string;
  productCode: string;
  productTitle: string;
  documentStatus: string;
  revision: string;
  layoutMode: DatasheetLayoutMode;
  layoutDensity: DatasheetLayoutDensity;
  pageSize: "A4";
  orientation: "portrait";
  primaryColor: string;
  accentColor: string;
  footerText: string;
  showPageNumbers: boolean;
  headerConfig: Record<string, unknown>;
  footerConfig: Record<string, unknown>;
};

export function createDefaultTemplateSettings(params: { productCode?: string; productTitle?: string; documentStatus?: string; revision?: string } = {}): DatasheetTemplateDefaults {
  const revision = params.revision ?? "Rev. A";
  const documentStatus = params.documentStatus ?? "Preliminary Datasheet";
  return {
    logoAssetPath: "/branding/vellore-semicon-logo.svg",
    companyName: "Vellore Semicon",
    website: "www.velloresemicon.com",
    productCode: params.productCode ?? "",
    productTitle: params.productTitle ?? "",
    documentStatus,
    revision,
    layoutMode: "two-column",
    layoutDensity: "technical-dense",
    pageSize: "A4",
    orientation: "portrait",
    primaryColor: "#0D2B55",
    accentColor: "#D6533E",
    footerText: `${documentStatus} | ${revision}`,
    showPageNumbers: true,
    headerConfig: {
      page: { width: 595, height: 842, marginX: 30 },
      logo: { x: 30, y: 28, width: 125, height: 24 },
      productCode: { x: 291, y: 36, align: "right", italic: true, uppercase: true },
      gradientLine: { x: 30, y: 56.75, width: 535, height: 3, from: "#D6533E", to: "#0D2B55" },
      secondaryLine: { x: 30, y: 61.75, width: 535, height: 1, from: "#D6533E", to: "#0D2B55" },
      productTitle: { x: 423, y: 69, align: "right", italic: true, uppercase: true }
    },
    footerConfig: {
      line: { x: 30, y: 787, width: 535, height: 1, color: "#0D2B55" },
      website: { x: 30, y: 794, color: "#464646" },
      pageNumber: { x: 294, y: 794, color: "#464646" },
      revision: { x: 405, y: 794, color: "#464646" }
    }
  };
}