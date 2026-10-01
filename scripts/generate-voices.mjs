// Credentials are read only from the process environment, never from game assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('Defina ELEVENLABS_API_KEY antes de gerar as vozes.');
const direction = JSON.parse(await fs.readFile(path.join(root, 'scripts/voice-direction.json'), 'utf8'));
const ids = Object.values(direction.cast).map(actor => actor.voiceId);
if (new Set(ids).size !== ids.length) throw new Error('Cada personagem precisa ter uma voz diferente.');
const out = path.join(root, 'public/assets/voices');
await fs.mkdir(out, { recursive: true });
const script = await fs.readFile(path.join(root, 'src/campaign/Mission1.js'), 'utf8');
const lines = [...script.matchAll(/d\.say\('([^']+)', '([^']+)'\)/g)]
  .map((m, i) => ({ id: `line-${String(i + 1).padStart(2, '0')}`, who: m[1], text: m[2] }));
let old = { lines: [] };
try { old = JSON.parse(await fs.readFile(path.join(out, 'manifest.json'), 'utf8')); } catch {}
const manifest = { provider: 'ElevenLabs', model: direction.model, cast: direction.cast, lines: [] };
const hash = value => createHash('sha256').update(value).digest('hex');

for (const [i, line] of lines.entries()) {
  const actor = direction.cast[line.who];
  if (!actor) throw new Error(`Personagem sem voz: ${line.who}`);
  const tags = direction.lines[line.id] || actor.tags;
  const spokenText = `${tags.map(tag => `[${tag}]`).join(' ')} ${line.text}`;
  const body = {
    text: spokenText, model_id: direction.model, language_code: 'pt',
    voice_settings: { stability: 0.5, similarity_boost: 0.85, speed: actor.speed },
    previous_text: lines[i - 1]?.who === line.who ? lines[i - 1].text : undefined,
    next_text: lines[i + 1]?.who === line.who ? lines[i + 1].text : undefined,
  };
  // Changing a model, actor, direction or context invalidates the old recording.
  const generationHash = hash(JSON.stringify({ voiceId: actor.voiceId, body }));
  const cached = old.lines.find(l => l.generationHash === generationHash);
  if (!process.argv.includes('--force') && cached && await fs.stat(path.join(out, cached.file)).then(() => true, () => false)) {
    manifest.lines.push({ ...cached, id: line.id });
    console.log(`Cache: ${line.id}`);
    continue;
  }
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${actor.voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`ElevenLabs: ${line.id}, HTTP ${response.status}, ${result.detail?.status || 'erro'}. O pacote anterior continua ativo.`);
  if (!result.audio_base64) throw new Error(`Sem áudio: ${line.id}`);
  const alignment = result.normalized_alignment || result.alignment;
  const ends = alignment?.character_end_times_seconds;
  if (!ends?.length) throw new Error(`Sem duração: ${line.id}`);
  const audio = Buffer.from(result.audio_base64, 'base64');
  // New filenames also invalidate browser caches, including forced regenerations.
  const file = `${line.id}-${line.who}-${hash(audio).slice(0, 12)}.mp3`;
  await fs.writeFile(path.join(out, file), audio);
  manifest.lines.push({ ...line, file, voiceId: actor.voiceId, voiceName: actor.name,
    model: direction.model, tags, spokenText, generationHash, duration: Math.max(...ends) + 0.2 });
  console.log(`Gerado ${line.id}: ${actor.name}, ${direction.model}, ${manifest.lines.at(-1).duration.toFixed(2)}s`);
}

// Publish only a complete pack, so a failed request cannot mix old and new voices.
const manifestFile = path.join(out, 'manifest.json');
await fs.writeFile(manifestFile + '.tmp', JSON.stringify(manifest, null, 2) + '\n');
await fs.rename(manifestFile + '.tmp', manifestFile);
await fs.writeFile(path.join(root, 'src/campaign/dialogue.json'), JSON.stringify(lines, null, 2) + '\n');
const keep = new Set(manifest.lines.map(line => line.file));
for (const previous of old.lines) {
  if (!keep.has(previous.file) && path.basename(previous.file) === previous.file) {
    await fs.unlink(path.join(out, previous.file)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}
console.log(`${manifest.lines.length} falas prontas; ${new Set(manifest.lines.map(line => line.voiceId)).size} vozes distintas.`);
