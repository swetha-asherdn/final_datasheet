import fs from "fs";

async function main() {
  const manifest = JSON.parse(fs.readFileSync("scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json", "utf-8"));
  for (const pageNum of [7, 8, 9]) {
    const p = manifest.pages.find((pg: any) => pg.pageNumber === pageNum);
    console.log(`\n================ PAGE ${pageNum} ================`);
    console.log("TEXT BLOCKS:");
    p?.textBlocks?.forEach((b: any) => {
      console.log(`  [y=${Math.round(b.boundingBox.y)}, h=${Math.round(b.boundingBox.height)}] ${b.text.slice(0, 100)}`);
    });
    console.log("TABLES:");
    p?.tables?.forEach((t: any) => {
      console.log(`  ${t.id}: ${t.rows?.length} rows`);
    });
    console.log("IMAGES:");
    p?.images?.forEach((im: any) => {
      console.log(`  ${im.id}: bbox=${JSON.stringify(im.boundingBox)}`);
    });
  }
}

main().catch(console.error);
