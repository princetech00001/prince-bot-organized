// Custom menu picture / video / GIF, saved in data/menu-media/.
// The menu uses the first one it finds: GIF, then video, then image, then
// the built-in banner.
import fs from "fs";
import path from "path";

const DIR = path.resolve("./data/menu-media");
const FILES = { image: "image.jpg", video: "video.mp4", gif: "gif.mp4" };

export function getMenuMedia() {
  for (const type of ["gif", "video", "image"]) {
    const file = path.join(DIR, FILES[type]);
    if (fs.existsSync(file)) return { type, path: file };
  }
  return null;
}
export const hasMenuMedia = (type) => fs.existsSync(path.join(DIR, FILES[type]));

export function saveMenuMedia(type, buffer) {
  if (!FILES[type]) throw new Error("unknown media type");
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, FILES[type]), buffer);
}
export function clearMenuMedia(type) {
  const file = path.join(DIR, FILES[type] || "");
  if (!FILES[type] || !fs.existsSync(file)) return false;
  fs.rmSync(file, { force: true });
  return true;
}
