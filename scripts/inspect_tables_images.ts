import fs from "fs";

async function main() {
  const manifest = JSON.parse(fs.readFileSync("scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json", "utf-8"));
  for (const page of manifest.pages) {
    console.log(`\n================ PAGE ${page.pageNumber} ================`);
    console.log(`--- TABLES (${page.tables?.length || 0}) ---`);
    for (const t of page.tables || []) {
      console.log(`  Table ${t.id} [bbox: ${JSON.stringify(t.boundingBox)}]:`);
      const sampleRows = t.rows?.slice(0, 3).map((r: any) => r.map((c: any) => (typeof c === "string" ? c : c?.text)).join(" | "));
      console.log(`    Rows sample:`, sampleRows);
    }
    console.log(`--- IMAGES (${page.images?.length || 0}) ---`);
    for (const img of page.images || []) {
      console.log(`  Image ${img.id} [bbox: ${JSON.stringify(img.boundingBox)}, size: ${img.width}x${img.height}]`);
    }
  }
}

main().catch(console.error);
