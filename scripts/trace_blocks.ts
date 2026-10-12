import { connectToDatabase } from '../src/server/db';
import { ProjectModel } from '../src/server/models/project';
import { ExtractedPageModel } from '../src/server/models/extracted-page';

function rectsIntersect(a: any, b: any) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function overlapRatio(a: any, b: any) {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const overlapArea = xOverlap * yOverlap;
  const aArea = Math.max(1, a.width * a.height);
  return overlapArea / aArea;
}

async function main() {
  await connectToDatabase();
  const project = await ProjectModel.findById('6ac5f907cadf8c3890130a39');
  const pages = await ExtractedPageModel.find({ projectId: project?._id }).sort({ pageNumber: 1 }).lean();

  for (const page of pages) {
    console.log(`\n=================== PAGE ${page.pageNumber} ===================`);
    for (const table of page.tables) {
      const tableBox = table.boundingBox;
      const rows = table.rows ?? [];
      const rowCount = Math.max(1, rows.length);
      const colCount = Math.max(1, Math.max(...rows.map((r: any) => r.length)));
      const cellWidth = tableBox.width / colCount;
      const cellHeight = tableBox.height / rowCount;

      console.log(`Table ${table.id}: rows=${rowCount}, cols=${colCount}, cellW=${cellWidth.toFixed(1)}, cellH=${cellHeight.toFixed(1)}`);

      for (const block of page.textBlocks) {
        let suppress = false;
        let matchedCell = null;
        for (let r = 0; r < rowCount && !suppress; r += 1) {
          for (let c = 0; c < colCount && !suppress; c += 1) {
            const cellBox = {
              x: tableBox.x + c * cellWidth,
              y: tableBox.y + r * cellHeight,
              width: cellWidth,
              height: cellHeight,
            };
            const ratio = overlapRatio(block.boundingBox, cellBox);
            if (ratio >= 0.45) {
              suppress = true;
              matchedCell = { r, c, ratio };
              break;
            }
          }
        }
        if (suppress) {
          console.log(`  SUPPRESSED by cell overlap: Block ${block.id} ("${block.text.slice(0, 30)}..."): r=${matchedCell?.r}, c=${matchedCell?.c}, ratio=${matchedCell?.ratio.toFixed(2)}`);
        }
      }
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
