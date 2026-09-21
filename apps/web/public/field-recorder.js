class FieldRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.used = 0;
    this.total = 0;
    this.done = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') this.finish();
    };
  }
  flush() {
    if (this.used) {
      const block = this.buffer.slice(0, this.used);
      this.port.postMessage({ samples: block }, [block.buffer]);
      this.used = 0;
    }
  }
  finish() {
    if (this.done) return;
    this.done = true;
    this.flush();
    this.port.postMessage({ done: true });
  }
  process(inputs) {
    if (this.done) return false;
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const sample of input) {
      if (this.total >= Math.floor(sampleRate * 25)) {
        this.finish();
        return false;
      }
      this.buffer[this.used++] = sample;
      this.total++;
      if (this.used === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor('field-recorder', FieldRecorder);
