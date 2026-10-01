// Pre-generated dialogue assets. No external credentials or API calls at runtime.
export class VoiceTracks {
  constructor(audio) {
    this.audio = audio;
    this.buffers = new Map();
    this.active = null;
  }

  async load() {
    if (!this.audio.ctx) return;
    try {
      const response = await fetch('/assets/voices/manifest.json', { cache: 'no-store' });
      if (!response.ok) return;
      const manifest = await response.json();
      await Promise.all(manifest.lines.map(async (line) => {
        try {
          const response = await fetch(`/assets/voices/${line.file}`);
          if (!response.ok) return;
          const buffer = await this.audio.ctx.decodeAudioData(await response.arrayBuffer());
          this.buffers.set(`${line.who}:${line.text}`, buffer);
        } catch { /* Browser speech remains available if an asset cannot load. */ }
      }));
    } catch { /* Optional voice pack: the mission still works without it. */ }
  }

  duration(who, text) { return this.buffers.get(`${who}:${text}`)?.duration; }

  play(who, text, radio = false) {
    const buffer = this.buffers.get(`${who}:${text}`);
    if (!buffer) return null;
    this.stop();
    const ctx = this.audio.ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain(); gain.gain.value = 0.95;
    const nodes = [source, gain];
    if (radio) {
      const hp = this.audio.filter('highpass', 280);
      const lp = this.audio.filter('lowpass', 3800);
      source.connect(hp).connect(lp).connect(gain);
      nodes.push(hp, lp);
    } else source.connect(gain);
    gain.connect(this.audio.dialogue);
    this.audio.duck(true);
    return new Promise((resolve) => {
      const finish = () => {
        if (this.active?.source !== source) return;
        this.active = null;
        nodes.forEach(node => node.disconnect());
        this.audio.duck(false);
        resolve();
      };
      this.active = { source, finish };
      source.onended = finish;
      source.start();
    });
  }

  stop() {
    if (!this.active) return;
    const { source, finish } = this.active;
    source.stop();
    finish();
  }
}
