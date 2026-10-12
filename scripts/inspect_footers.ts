import fs from "fs";

async function main() {
  const manifest = JSON.parse(fs.readFileSync("scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json", "utf-8"));
  manifest.pages.forEach((p: any) => {
    const footers = p.textBlocks?.filter((b: any) => b.boundingBox?.y > 750).map((b: any) => b.text);
    console.log(`Page ${p.pageNumber} footers:`, footers);
  });
}

main().catch(console.error);
