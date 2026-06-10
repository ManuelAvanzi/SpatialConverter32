/**
 * extract.js
 * Legge un .unitypackage, parsa la scena Unity YAML,
 * estrae tutti i componenti Spatial SDK e genera scene.json + copia gli asset.
 *
 * Uso: node extract.js <percorso.unitypackage> <cartella-output>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// GUID del SpatialInteractable script (trovato analizzando il package)
const SPATIAL_INTERACTABLE_GUID = '7a1c437d99c9a4616adbe21f3ffa0e18';
const SPATIAL_QUEST_GUID_MARKER = 'SpatialSys.UnitySDK.SpatialQuest';

function run(pkgPath, outputDir) {
  // Supporta anche una cartella già estratta al posto del .unitypackage
  const isAlreadyExtracted = fs.statSync(pkgPath).isDirectory();

  let tmpDir, cleanupTmp = false;

  if (isAlreadyExtracted) {
    tmpDir = pkgPath;
    console.log(`\n📂 Uso cartella già estratta: ${tmpDir}`);
  } else {
    console.log(`\n📦 Estrazione: ${pkgPath}`);
    // Usa una cartella temp vicino al package (stesso drive) per evitare problemi di spazio sul disco C:
    tmpDir = path.join(path.dirname(pkgPath), '_spat_tmp_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    execSync(`tar -xzf "${pkgPath}" -C "${tmpDir}"`, { stdio: 'inherit' });
    console.log(`✅ Estratto in: ${tmpDir}`);
    cleanupTmp = true;
  }

  // 2. Costruisci mappa guid → { assetPath, assetFile }
  const guidMap = buildGuidMap(tmpDir);
  console.log(`📂 Asset trovati: ${Object.keys(guidMap).length}`);

  // 3. Trova il file .unity (la scena)
  const sceneEntry = Object.values(guidMap).find(e => e.path.endsWith('.unity'));
  if (!sceneEntry) throw new Error('Nessun file .unity trovato nel package!');
  console.log(`🎬 Scena: ${sceneEntry.path}`);

  // 4. Parsa la scena Unity YAML
  const sceneYaml = fs.readFileSync(sceneEntry.assetFile, 'utf8');
  const scene = parseUnityScene(sceneYaml, guidMap);

  // 5. Prepara cartella output
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'models'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'textures'), { recursive: true });

  // 6. Copia i file FBX e texture nell'output
  copyAssets(guidMap, tmpDir, outputDir, scene);

  // 7. Scrivi scene.json
  const sceneJsonPath = path.join(outputDir, 'scene.json');
  fs.writeFileSync(sceneJsonPath, JSON.stringify(scene, null, 2));
  console.log(`\n✅ scene.json scritto: ${sceneJsonPath}`);
  console.log(`   Interactable: ${scene.interactables.length}`);
  console.log(`   Teleport: ${scene.teleports.length}`);
  console.log(`   Quest: ${scene.quests.length}`);
  console.log(`   Modelli FBX: ${scene.models.length}`);

  // Cleanup (solo se abbiamo estratto noi, non se era già una cartella)
  if (cleanupTmp) fs.rmSync(tmpDir, { recursive: true, force: true });
  return scene;
}

// ─── Parsing YAML Unity ─────────────────────────────────────────────────────

function parseUnityScene(yaml, guidMap) {
  const blocks = splitIntoBlocks(yaml);

  // Mappe fileID → dati
  const gameObjects = {};   // fileID → { name, components: [fileID...] }
  const transforms = {};    // fileID → { goFileID, pos, rot, scale, parent, children }
  const monoBehaviours = {}; // fileID → { goFileID, scriptGuid, props }
  const meshFilters = {};   // fileID → { goFileID, meshGuid }
  const animators = {};     // fileID → { goFileID, controllerGuid }

  for (const block of blocks) {
    const typeMatch = block.match(/^--- !u!(\d+) &(\d+)/);
    if (!typeMatch) continue;
    const unityType = typeMatch[1];
    const fileID = typeMatch[2];

    switch (unityType) {
      case '1':  parseGameObject(fileID, block, gameObjects); break;
      case '4':  parseTransform(fileID, block, transforms); break;
      case '114': parseMonoBehaviour(fileID, block, monoBehaviours); break;
      case '33':  parseMeshFilter(fileID, block, meshFilters); break;
      case '95':  parseAnimator(fileID, block, animators); break;
    }
  }

  // Collega GameObjects ai loro Transform per ottenere la posizione world
  // (semplificato: usa localPosition come worldPosition per oggetti root)
  const goPositions = buildPositionMap(gameObjects, transforms);

  // Estrai interactable
  const interactables = extractInteractables(monoBehaviours, gameObjects, goPositions, guidMap);

  // Estrai quest
  const quests = extractQuests(monoBehaviours, gameObjects, goPositions);

  // Estrai teleport (oggetti con "Teleport" nel nome)
  const teleports = extractTeleports(gameObjects, transforms, goPositions);

  // Estrai tutti i modelli FBX referenziati
  const models = extractModels(meshFilters, guidMap);

  // Raccogli tutti gli animator (per sapere quali animazioni ci sono)
  const animations = extractAnimations(animators, monoBehaviours, gameObjects, guidMap);

  return {
    meta: {
      convertedAt: new Date().toISOString(),
      source: 'SpatialCreativeToolkit/Unity'
    },
    interactables,
    teleports,
    quests,
    models,
    animations
  };
}

function splitIntoBlocks(yaml) {
  return yaml.split(/(?=--- !u!)/).filter(b => b.trim().length > 0);
}

function parseGameObject(fileID, block, map) {
  const name = (block.match(/  m_Name: (.+)/) || [])[1]?.trim() || '';
  const componentMatches = [...block.matchAll(/component: \{fileID: (\d+)\}/g)];
  const components = componentMatches.map(m => m[1]);
  map[fileID] = { name, components };
}

function parseTransform(fileID, block, map) {
  const goMatch = block.match(/m_GameObject: \{fileID: (\d+)\}/);
  const posMatch = block.match(/m_LocalPosition: \{x: ([\d.e+-]+), y: ([\d.e+-]+), z: ([\d.e+-]+)\}/);
  const rotMatch = block.match(/m_LocalRotation: \{x: ([\d.e+-]+), y: ([\d.e+-]+), z: ([\d.e+-]+), w: ([\d.e+-]+)\}/);
  const scaleMatch = block.match(/m_LocalScale: \{x: ([\d.e+-]+), y: ([\d.e+-]+), z: ([\d.e+-]+)\}/);
  const parentMatch = block.match(/m_Father: \{fileID: (\d+)\}/);
  const childrenMatches = [...block.matchAll(/- \{fileID: (\d+)\}/g)];

  map[fileID] = {
    goFileID: goMatch?.[1] || null,
    pos: posMatch ? { x: parseFloat(posMatch[1]), y: parseFloat(posMatch[2]), z: parseFloat(posMatch[3]) } : { x: 0, y: 0, z: 0 },
    rot: rotMatch ? { x: parseFloat(rotMatch[1]), y: parseFloat(rotMatch[2]), z: parseFloat(rotMatch[3]), w: parseFloat(rotMatch[4]) } : { x: 0, y: 0, z: 0, w: 1 },
    scale: scaleMatch ? { x: parseFloat(scaleMatch[1]), y: parseFloat(scaleMatch[2]), z: parseFloat(scaleMatch[3]) } : { x: 1, y: 1, z: 1 },
    parentFileID: parentMatch?.[1] || '0',
    children: childrenMatches.map(m => m[1])
  };
}

function parseMonoBehaviour(fileID, block, map) {
  const goMatch = block.match(/m_GameObject: \{fileID: (\d+)\}/);
  const scriptMatch = block.match(/m_Script: \{fileID: \d+, guid: ([a-f0-9]+)/);

  const props = {};

  // Interactable props
  const interactText = (block.match(/  interactText: (.+)/) || [])[1]?.trim();
  if (interactText) props.interactText = interactText;

  const interactiveRadius = (block.match(/  interactiveRadius: ([\d.]+)/) || [])[1];
  if (interactiveRadius) props.interactiveRadius = parseFloat(interactiveRadius);

  const visibilityRadius = (block.match(/  visibilityRadius: ([\d.]+)/) || [])[1];
  if (visibilityRadius) props.visibilityRadius = parseFloat(visibilityRadius);

  // Quest props
  const questName = (block.match(/  questName: (.+)/) || [])[1]?.trim();
  if (questName) props.questName = questName;

  // Estrai le chiamate all'onInteractEvent
  props.onInteractActions = parseUnityEvents(block, 'onInteractEvent');
  props.onEnterActions = parseUnityEvents(block, 'onEnterEvent');
  props.onExitActions = parseUnityEvents(block, 'onExitEvent');

  // Quest events
  const questEventType = (block.match(/  questEventType: (\d+)/) || [])[1];
  if (questEventType) props.questEventType = parseInt(questEventType);

  // Detect tipo componente
  let componentType = 'unknown';
  if (props.interactText !== undefined) componentType = 'SpatialInteractable';
  else if (props.questName !== undefined) componentType = 'SpatialQuest';
  else if (block.includes(SPATIAL_QUEST_GUID_MARKER)) componentType = 'SpatialQuest';

  map[fileID] = {
    goFileID: goMatch?.[1] || null,
    scriptGuid: scriptMatch?.[1] || null,
    componentType,
    props
  };
}

function parseUnityEvents(block, eventName) {
  const actions = [];
  const eventSection = block.match(new RegExp(`${eventName}:[\\s\\S]*?(?=  on\\w+Event:|$)`))?.[0];
  if (!eventSection) return actions;

  const callMatches = [...eventSection.matchAll(
    /m_MethodName: (\w+)[\s\S]*?m_StringArgument: ([^\n]*)[\s\S]*?m_BoolArgument: (\d)/g
  )];

  for (const m of callMatches) {
    actions.push({
      method: m[1].trim(),
      stringArg: m[2].trim(),
      boolArg: m[3] === '1'
    });
  }
  return actions;
}

function parseMeshFilter(fileID, block, map) {
  const goMatch = block.match(/m_GameObject: \{fileID: (\d+)\}/);
  const meshMatch = block.match(/m_Mesh: \{fileID: \d+, guid: ([a-f0-9]+)/);
  if (goMatch && meshMatch) {
    map[fileID] = { goFileID: goMatch[1], meshGuid: meshMatch[1] };
  }
}

function parseAnimator(fileID, block, map) {
  const goMatch = block.match(/m_GameObject: \{fileID: (\d+)\}/);
  const controllerMatch = block.match(/m_Controller: \{fileID: \d+, guid: ([a-f0-9]+)/);
  if (goMatch) {
    map[fileID] = { goFileID: goMatch[1], controllerGuid: controllerMatch?.[1] || null };
  }
}

// ─── Costruisci mappa posizioni ─────────────────────────────────────────────

function buildPositionMap(gameObjects, transforms) {
  // Crea una mappa: goFileID → transform
  const goToTransform = {};
  for (const [tId, t] of Object.entries(transforms)) {
    if (t.goFileID) goToTransform[t.goFileID] = t;
  }

  const positions = {};
  for (const [goId, go] of Object.entries(gameObjects)) {
    const t = goToTransform[goId];
    if (t) positions[goId] = { pos: t.pos, rot: t.rot, scale: t.scale };
  }
  return positions;
}

// ─── Estrai componenti Spatial ───────────────────────────────────────────────

function extractInteractables(monoBehaviours, gameObjects, goPositions, guidMap) {
  const result = [];
  for (const [mbId, mb] of Object.entries(monoBehaviours)) {
    if (mb.componentType !== 'SpatialInteractable') continue;
    const go = gameObjects[mb.goFileID] || {};
    const transform = goPositions[mb.goFileID] || {};

    result.push({
      id: mbId,
      name: go.name || '',
      position: transform.pos || { x: 0, y: 0, z: 0 },
      rotation: transform.rot || { x: 0, y: 0, z: 0, w: 1 },
      interactText: mb.props.interactText || '',
      interactiveRadius: mb.props.interactiveRadius || 3,
      visibilityRadius: mb.props.visibilityRadius || 5,
      onInteract: mb.props.onInteractActions || [],
      onEnter: mb.props.onEnterActions || [],
      onExit: mb.props.onExitActions || []
    });
  }
  return result;
}

function extractQuests(monoBehaviours, gameObjects, goPositions) {
  const result = [];
  for (const [mbId, mb] of Object.entries(monoBehaviours)) {
    if (mb.componentType !== 'SpatialQuest') continue;
    const go = gameObjects[mb.goFileID] || {};
    result.push({
      id: mbId,
      name: mb.props.questName || go.name || '',
      goName: go.name || ''
    });
  }
  return result;
}

function extractTeleports(gameObjects, transforms, goPositions) {
  const result = [];
  const goToTransform = {};
  for (const t of Object.values(transforms)) {
    if (t.goFileID) goToTransform[t.goFileID] = t;
  }

  for (const [goId, go] of Object.entries(gameObjects)) {
    if (/teleport/i.test(go.name)) {
      const t = goToTransform[goId];
      result.push({
        id: goId,
        name: go.name,
        position: t?.pos || { x: 0, y: 0, z: 0 },
        rotation: t?.rot || { x: 0, y: 0, z: 0, w: 1 }
      });
    }
  }
  return result;
}

function extractModels(meshFilters, guidMap) {
  const seen = new Set();
  const result = [];
  for (const mf of Object.values(meshFilters)) {
    const guid = mf.meshGuid;
    if (!guid || seen.has(guid)) continue;
    seen.add(guid);
    const asset = guidMap[guid];
    if (asset && (asset.path.endsWith('.fbx') || asset.path.endsWith('.FBX'))) {
      result.push({ guid, originalPath: asset.path, fileName: path.basename(asset.path) });
    }
  }
  return result;
}

function extractAnimations(animators, monoBehaviours, gameObjects, guidMap) {
  const result = [];
  // Raccogli tutte le animation clip string trovate negli interactable
  for (const mb of Object.values(monoBehaviours)) {
    if (mb.componentType !== 'SpatialInteractable') continue;
    for (const action of mb.props.onInteractActions || []) {
      if (action.method === 'Play' && action.stringArg) {
        result.push({ clip: action.stringArg, triggeredBy: mb.props.interactText });
      }
    }
  }
  return result;
}

// ─── Mappa guid → asset ─────────────────────────────────────────────────────

function buildGuidMap(tmpDir) {
  const map = {};
  const folders = fs.readdirSync(tmpDir);
  for (const folder of folders) {
    const folderPath = path.join(tmpDir, folder);
    const pathnamePath = path.join(folderPath, 'pathname');
    const assetPath = path.join(folderPath, 'asset');
    if (!fs.existsSync(pathnamePath)) continue;
    const assetName = fs.readFileSync(pathnamePath, 'utf8').trim();
    map[folder] = { path: assetName, assetFile: assetPath, folder: folderPath };
  }
  return map;
}

// ─── Copia asset ─────────────────────────────────────────────────────────────

function copyAssets(guidMap, tmpDir, outputDir, scene) {
  // Copia FBX
  for (const model of scene.models) {
    const entry = guidMap[model.guid];
    if (!entry || !fs.existsSync(entry.assetFile)) continue;
    const dest = path.join(outputDir, 'models', model.fileName);
    fs.copyFileSync(entry.assetFile, dest);
    model.localPath = path.join('models', model.fileName);
    console.log(`  📦 FBX: ${model.fileName}`);
  }

  // Copia texture (jpg/png/jpeg)
  for (const [guid, entry] of Object.entries(guidMap)) {
    const ext = path.extname(entry.path).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.exr'].includes(ext)) {
      const fileName = path.basename(entry.path);
      const dest = path.join(outputDir, 'textures', fileName);
      if (fs.existsSync(entry.assetFile)) {
        fs.copyFileSync(entry.assetFile, dest);
      }
    }
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Uso: node extract.js <percorso.unitypackage> <cartella-output>');
  process.exit(1);
}

try {
  run(args[0], args[1]);
} catch (e) {
  console.error('❌ Errore:', e.message);
  process.exit(1);
}
