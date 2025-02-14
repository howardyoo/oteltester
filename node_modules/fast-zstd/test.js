let zstd = require('./index');

let string = 'the quick brown fox jumped over the lazy dog';

let compressed = zstd.compress(Buffer.from(string, 'utf8'));

console.log(string.length);
console.log(compressed.length);

let decompressed = Buffer.from(zstd.decompress(compressed), 'utf8').toString();

console.log(decompressed);
