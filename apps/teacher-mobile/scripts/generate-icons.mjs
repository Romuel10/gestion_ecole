import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const root = process.cwd();
const source = path.resolve(root, '../../public/sekoly-app.svg');
const assetsDir = path.join(root, 'assets');
const iconPath = path.join(assetsDir, 'icon.png');
const adaptivePath = path.join(assetsDir, 'adaptive-icon.png');

await mkdir(assetsDir, { recursive: true });

const svg = await readFile(source);
await sharp(svg)
  .resize(1024, 1024, { fit: 'contain' })
  .png()
  .toFile(iconPath);

const transparentSvg = Buffer.from(
  svg
    .toString('utf8')
    .replace(/<rect\s+width="512"\s+height="512"\s+rx="88"\s+fill="#f8faf8"\s*\/>/i, '')
);

const foreground = await sharp(transparentSvg)
  .resize(720, 720, { fit: 'contain' })
  .png()
  .toBuffer();

await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: foreground, gravity: 'center' }])
  .png()
  .toFile(adaptivePath);

console.log('Sekoly mobile icons generated:', iconPath, adaptivePath);
