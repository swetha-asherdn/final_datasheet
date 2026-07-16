import { describe, expect, it } from "vitest";
import { DATASHEET_DOCUMENT_STATUSES, datasheetPatchSchema, templateSettingsPatchSchema } from "@/server/datasheet/schema";
import { createDefaultTemplateSettings } from "@/server/datasheet/template";

describe("datasheet template and schemas", () => {
  it("creates the default Vellore Semicon A4 template settings", () => {
    const settings = createDefaultTemplateSettings({ productCode: "VS123", productTitle: "Power regulator" });

    expect(settings.logoAssetPath).toBe("/branding/vellore-semicon-logo.svg");
    expect(settings.primaryColor).toBe("#0D2B55");
    expect(settings.accentColor).toBe("#D6533E");
    expect(settings.headerConfig.gradientLine).toMatchObject({ x: 30, y: 56.75, width: 535 });
    expect(settings.footerText).toBe("Preliminary Datasheet | Rev. A");
    expect(settings.layoutMode).toBe("two-column");
    expect(settings.layoutDensity).toBe("technical-dense");
  });

  it("validates template colors and datasheet status transitions", () => {
    expect(DATASHEET_DOCUMENT_STATUSES).toContain("READY_FOR_EDIT");
    expect(templateSettingsPatchSchema.parse({ primaryColor: "#0D2B55" }).primaryColor).toBe("#0D2B55");
    expect(templateSettingsPatchSchema.parse({ layoutMode: "single-column" }).layoutMode).toBe("single-column");
    expect(templateSettingsPatchSchema.parse({ layoutDensity: "comfortable" }).layoutDensity).toBe("comfortable");
    expect(() => templateSettingsPatchSchema.parse({ accentColor: "orange" })).toThrow();
    expect(datasheetPatchSchema.parse({ status: "READY_FOR_EXPORT" }).status).toBe("READY_FOR_EXPORT");
  });
});
