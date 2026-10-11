// Renders build/icon.html into build/icon.ico for electron-builder: one PNG entry per
// size, each drawn at that size rather than scaled down. Also writes build/icon.png at
// HD_SIZE, for store pages and the Discord app. Run with `npm run icon`.
import { app, BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const HD_SIZE = 1024;

// ICO container: a 6-byte header, a 16-byte entry per image, then the PNGs themselves.
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(([size, png], i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size % 256, e); // 0 means 256
    header.writeUInt8(size % 256, e + 1);
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(([, png]) => png)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadFile(join(here, 'icon.html'));
  const urls = await win.webContents.executeJavaScript('SIZES.map((s) => [s, drawIcon(s).toDataURL()])');
  const images = urls.map(([size, url]) => [size, Buffer.from(url.split(',')[1], 'base64')]);
  writeFileSync(join(here, 'icon.ico'), ico(images));
  const hd = await win.webContents.executeJavaScript(`drawIcon(${HD_SIZE}).toDataURL()`);
  writeFileSync(join(here, 'icon.png'), Buffer.from(hd.split(',')[1], 'base64'));
  console.log(`build/icon.ico: ${images.map(([s]) => s).join(', ')}; build/icon.png: ${HD_SIZE}`);
  app.quit();
});
