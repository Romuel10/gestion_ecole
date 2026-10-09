const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const manifest = require('./security-patches.json');
const root = path.resolve(__dirname, '..');
const hash = source => crypto.createHash('sha256').update(source).digest('hex');

function verifyPatches(verifyOnly = false) {
  for (const entry of manifest.files) {
    const folder = path.join(root, 'node_modules', entry.package);
    if (require(path.join(folder, 'package.json')).version !== entry.version) throw Error(`Réexaminer le correctif ${entry.package} après mise à jour.`);
    const file = path.join(folder, entry.path);
    let source = fs.readFileSync(file, 'utf8');
    if (hash(source) === entry.patchedSha256) continue;
    if (verifyOnly || hash(source) !== entry.originalSha256) throw Error(`Correctif de sécurité absent ou contenu inattendu : ${entry.package}/${entry.path}`);
    for (const operation of entry.operations) {
      if (source.split(operation.before).length !== 2) throw Error(`Contexte du correctif invalide : ${entry.path}`);
      source = source.replace(operation.before, () => operation.after);
    }
    if (hash(source) !== entry.patchedSha256) throw Error(`Empreinte du correctif invalide : ${entry.path}`);
    fs.writeFileSync(file, source);
  }
}
module.exports = { verifyPatches, manifest };
if (require.main === module) {
  verifyPatches(process.argv.includes('--verify'));
  console.log('Correctifs de sécurité Expo vérifiés par SHA-256.');
}
