import { isLikelyHeading, headingLevel, isSectionHeading } from '../src/server/datasheet/normalization';

const block = {
  id: "p1-text-3-sub0",
  text: "Отличительные особенности:",
  boundingBox: { x: 55, y: 166.6, width: 141.4, height: 11.0 },
  fontSize: 11,
  type: "text_block",
  pageNumber: 1
};

console.log("isLikelyHeading:", (isLikelyHeading as any)?.(block));
console.log("isSectionHeading:", (isSectionHeading as any)?.(block.text));
