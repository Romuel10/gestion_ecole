const { spawnSync } = require('node:child_process');
const { verifyPatches, manifest } = require('./security-patches.cjs');
verifyPatches(true);
if (Date.now() >= Date.parse(manifest.expires + 'T00:00:00Z')) throw Error('Réexaminer les correctifs temporaires Expo : échéance atteinte.');
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json'], {
  cwd: require('node:path').resolve(__dirname, '..'), encoding: 'utf8', shell: process.platform === 'win32',
});
if (result.error) throw result.error;
let audit;
try { audit = JSON.parse(result.stdout); } catch { throw Error('Audit npm indisponible : publication bloquée.'); }
if (audit.error || !audit.vulnerabilities || !audit.metadata) throw Error('Audit npm incomplet : publication bloquée.');
const unmitigated = [];
const mitigated = new Set();
for (const [name, entry] of Object.entries(audit.vulnerabilities)) {
  for (const advisory of entry.via) {
    if (typeof advisory === 'string') continue; // Propagated findings are checked at their source package.
    const id = advisory.url.split('/').pop();
    if (manifest.advisories[name] === id && manifest.files.some(file => file.package === name)) mitigated.add(id);
    else unmitigated.push(`${name}: ${id} (${advisory.severity})`);
  }
}
if (unmitigated.length) throw Error(`Vulnérabilités sans correction :\n${unmitigated.join('\n')}`);
console.log(`Aucune alerte sans correction. Correctifs temporaires vérifiés : ${[...mitigated].join(', ') || 'aucun'}.`);
