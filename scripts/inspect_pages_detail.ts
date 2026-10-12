import fs from "fs";

async function main() {
  const manifest = JSON.parse(fs.readFileSync("scratch/CW29150R-XX_CW29150R-ADJ_CW29151R-XX_vsp__2__pdf.manifest.json", "utf-8"));
  manifest.pages.forEach((p: any) => {
    console.log(`=== PAGE ${p.pageNumber} ===`);
    console.log("TEXT SAMPLE:");
    console.log(p.text ? p.text.slice(0, 300).replace(/\n/g, " ") : "(no text)");
    console.log("TABLES:", p.tables?.length || 0);
    p.tables?.forEach((t: any, i: number) => {
      console.log(`  Table ${i}: rows=${t.rows?.length}, headers=${JSON.stringify(t.headers)}`);
    });
    console.log("IMAGES:", p.images?.length || 0);
    p.images?.forEach((im: any) => {
      console.log(`  Image: id=${im.id}, type=${im.imageType}, bbox=${JSON.stringify(im.boundingBox)}`);
    });
  });
}

main().catch(console.error);
