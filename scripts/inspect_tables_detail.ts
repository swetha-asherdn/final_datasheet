import fs from "fs";

async function main() {
  const manifest = JSON.parse(fs.readFileSync("scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json", "utf-8"));
  const p2 = manifest.pages.find((p: any) => p.pageNumber === 2);
  const p3 = manifest.pages.find((p: any) => p.pageNumber === 3);

  console.log("=== Page 2 Table 2 rows ===");
  p2.tables[2].rows.forEach((r: any, i: number) => {
    console.log(`Row ${i}:`, r.map((c: any) => typeof c === 'string' ? c : c?.text).join(" | "));
  });

  console.log("\n=== Page 3 Table 0 rows ===");
  p3.tables[0].rows.forEach((r: any, i: number) => {
    console.log(`Row ${i}:`, r.map((c: any) => typeof c === 'string' ? c : c?.text).join(" | "));
  });
}

main().catch(console.error);
