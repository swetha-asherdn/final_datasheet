import fs from "fs";

async function main() {
  const manifest = JSON.parse(fs.readFileSync("scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json", "utf-8"));
  for (const pageNum of [4, 5, 6]) {
    const p = manifest.pages.find((pg: any) => pg.pageNumber === pageNum);
    console.log(`\n================ PAGE ${pageNum} ================`);
    console.log("TEXT BLOCKS:");
    p?.textBlocks?.forEach((b: any) => {
      console.log(`  [y=${Math.round(b.boundingBox.y)}, h=${Math.round(b.boundingBox.height)}] ${b.text.slice(0, 100)}`);
    });
    console.log("IMAGES:");
    p?.images?.forEach((im: any) => {
      console.log(`  ${im.id}: bbox=${JSON.stringify(im.boundingBox)}`);
    });
  }
}

main().catch(console.error);
