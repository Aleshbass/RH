/**
 * AI scribe audio capture (components/physio/notes/scribe/liveTranscriber.ts). Runs on the audio
 * thread: mixes the input to mono, brings it down to 16 kHz, and posts it to the page as 16-bit
 * samples in ~100 ms blocks, with the block's loudness for the level meter and pause detection.
 * Used only when the live connection isn't available; nothing here is stored.
 */
const TARGET_RATE = 16000;
const BLOCK = 1600; // 100 ms at 16 kHz

class ScribePcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.position = 0; // fractional read position into the incoming stream
    this.acc = 0;
    this.accCount = 0;
    this.out = new Int16Array(BLOCK);
    this.outLength = 0;
    this.sumSquares = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;
    const frames = input[0].length;
    for (let i = 0; i < frames; i++) {
      let sample = 0;
      for (let c = 0; c < input.length; c++) sample += input[c][i];
      sample /= input.length;
      // Average the samples that fall into each 16 kHz slot (a simple low-pass before decimating)
      this.acc += sample;
      this.accCount++;
      this.position += 1;
      if (this.position >= this.ratio) {
        this.position -= this.ratio;
        const value = Math.max(-1, Math.min(1, this.acc / this.accCount));
        this.acc = 0;
        this.accCount = 0;
        this.out[this.outLength++] = value < 0 ? value * 0x8000 : value * 0x7fff;
        this.sumSquares += value * value;
        if (this.outLength === BLOCK) {
          const rms = Math.sqrt(this.sumSquares / BLOCK);
          this.port.postMessage({ pcm: this.out.buffer, rms }, [this.out.buffer]);
          this.out = new Int16Array(BLOCK);
          this.outLength = 0;
          this.sumSquares = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("scribe-pcm", ScribePcmProcessor);
