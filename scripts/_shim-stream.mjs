// Minimal shim: papaparse only uses stream.Duplex for Node.js streaming mode.
// In Edge Runtime (browser-like), papaparse falls back to non-streaming parse.
export class Duplex {}
export default { Duplex };
