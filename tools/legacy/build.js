/**
 * build.js
 * Orchestratore principale: estrae il .unitypackage, converte FBX in GLB,
 * e copia il viewer nella cartella output finale.
 *
 * Uso: node build.js <percorso.unitypackage> [--output <cartella>] [--blender <percorso-blender>]
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const BLENDER_DEFAULT = 'C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe';

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { pkgPath: null, outputDir: null, blenderPath: BLENDER_DEFAULT };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) result.outputDir = args[++i];
    else if (args[i] === '--blender' && args[i + 1]) result.blenderPath = args[++i];
    else if (!args[i].startsWith('--')) result.pkgPath = args[i];
  }

  return result;
}

function step(msg) {
  console.log(`\n${'─'.repeat(60)}\n🔧 ${msg}\n${'─'.repeat(60)}`);
}

async function main() {
  const { pkgPath, blenderPath } = parseArgs();
  let { outputDir } = parseArgs();

  if (!pkgPath) {
    console.error('Uso: node build.js <percorso.unitypackage> [--output <cartella>]');
    process.exit(1);
  }

  if (!fs.existsSync(pkgPath)) {
    console.error(`❌ File non trovato: ${pkgPath}`);
    process.exit(1);
  }

  // Output default: stessa cartella del package + nome senza estensione
  if (!outputDir) {
    const pkgName = path.basename(pkgPath, '.unitypackage').replace(/\s+/g, '_');
    outputDir = path.join(path.dirname(pkgPath), pkgName + '_web');
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Spatial → Web Converter`);
  console.log(`  Input:  ${pkgPath}`);
  console.log(`  Output: ${outputDir}`);
  console.log(`${'═'.repeat(60)}`);

  // ── Step 1: Estrai e parsa la scena ──────────────────────────────────────
  step('Step 1/3 — Estrazione scena Unity');
  const extractScript = path.join(__dirname, 'extract.js');
  execSync(`node "${extractScript}" "${pkgPath}" "${outputDir}"`, { stdio: 'inherit' });

  // ── Step 2: Converti FBX → GLB con Blender ───────────────────────────────
  step('Step 2/3 — Conversione FBX → GLB');
  const modelsDir = path.join(outputDir, 'models');
  const hasFbx = fs.readdirSync(modelsDir).some(f => f.toLowerCase().endsWith('.fbx'));

  if (!hasFbx) {
    console.log('⚠️  Nessun FBX trovato nella cartella models, skip conversione.');
  } else if (!fs.existsSync(blenderPath)) {
    console.log(`⚠️  Blender non trovato in: ${blenderPath}`);
    console.log('   Salta la conversione GLB. Installa Blender o usa --blender <percorso>');
  } else {
    const convertScript = path.join(__dirname, 'blender-convert.py');
    const blenderCmd = [
      `"${blenderPath}"`,
      '--background',
      '--python', `"${convertScript}"`,
      '--',
      `"${modelsDir}"`,
      '--merge'
    ].join(' ');

    console.log(`Eseguo: ${blenderCmd}\n`);
    execSync(blenderCmd, { stdio: 'inherit' });

    // Rimuovi FBX dopo conversione (opzionale, per ridurre dimensioni)
    // fs.readdirSync(modelsDir).filter(f => f.toLowerCase().endsWith('.fbx'))
    //   .forEach(f => fs.unlinkSync(path.join(modelsDir, f)));
  }

  // ── Step 3: Copia viewer HTML ─────────────────────────────────────────────
  step('Step 3/3 — Copia viewer web');
  copyViewer(outputDir);

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ✅ Build completata!`);
  console.log(`  📁 Output: ${outputDir}`);
  console.log(`  🌐 Per avviare: npx serve "${outputDir}"`);
  console.log(`${'═'.repeat(60)}\n`);
}

function copyViewer(outputDir) {
  const viewerSrc = path.join(__dirname, '..', '..', 'viewer', 'index.html');
  const viewerDest = path.join(outputDir, 'index.html');

  if (!fs.existsSync(viewerSrc)) {
    console.log('⚠️  viewer/index.html non trovato — skip copia viewer');
    return;
  }

  fs.copyFileSync(viewerSrc, viewerDest);
  console.log(`✅ Viewer copiato: ${viewerDest}`);
}

main().catch(e => {
  console.error('❌ Errore:', e.message);
  process.exit(1);
});
