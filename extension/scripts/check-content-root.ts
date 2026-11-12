import { selfCheck } from "../src/lib/content-root.ts";
import { selfCheckKeywords } from "../src/lib/keyword-extractor.ts";

selfCheck();
selfCheckKeywords();
console.log("content-root ok");
