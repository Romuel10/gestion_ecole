const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const forge = require('node-forge');
const braces = require('braces');
const { verifyPatches } = require('../scripts/security-patches.cjs');

test('les fichiers corrigés correspondent aux empreintes revues', () => verifyPatches(true));

test('braces accepte les motifs ordinaires et borne les arbres imbriqués', () => {
  assert.deepEqual(braces.expand('src/{a,b}/{1..2}.ts'), ['src/a/1.ts','src/a/2.ts','src/b/1.ts','src/b/2.ts']);
  for (const fn of [braces, braces.compile, braces.expand, braces.stringify]) {
    assert.throws(() => fn('{'.repeat(4000) + 'x' + '}'.repeat(4000)), /exceeds max depth/);
    assert.throws(() => fn('('.repeat(4000) + 'x' + ')'.repeat(4000)), /exceeds max depth/);
  }
  let ast = { type: 'text', value: 'x' };
  for (let i=0; i<300; i++) ast = { type: 'paren', nodes: [ast] };
  for (const fn of [braces.compile, braces.expand, braces.stringify]) assert.throws(() => fn(ast), /exceeds max depth/);
});

test('RSA vérifie une signature valide et refuse les données ASN.1 ignorées', () => {
  const pem = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type:'pkcs1', format:'pem' });
  const key = forge.pki.privateKeyFromPem(pem);
  const publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
  const digest = forge.md.sha256.create().update('Sekoly regression');
  assert.equal(publicKey.verify(digest.digest().getBytes(), key.sign(digest)), true);
  const asn1 = forge.asn1;
  const node = (type, value, constructed=false) => asn1.create(asn1.Class.UNIVERSAL, type, constructed, value);
  for (const variant of ['extra-child', 'nonempty-null']) {
    const algorithm = [node(asn1.Type.OID, asn1.oidToDer(forge.oids.sha256).getBytes()), node(asn1.Type.NULL, variant === 'nonempty-null' ? 'garbage' : '')];
    if (variant === 'extra-child') algorithm.push(node(asn1.Type.OCTETSTRING, 'garbage'));
    const info = node(asn1.Type.SEQUENCE, [node(asn1.Type.SEQUENCE, algorithm, true), node(asn1.Type.OCTETSTRING, digest.digest().getBytes())], true);
    const signature = key.sign(asn1.toDer(info).getBytes(), 'NONE');
    assert.throws(() => publicKey.verify(digest.digest().getBytes(), signature), /valid RSASSA-PKCS1/);
  }
});
