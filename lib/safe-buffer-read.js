function safeBufferRead(buffer) {
  if (buffer.length === 0) {
    return '';
  }

  // utf16
  if (buffer[0] === 255 && buffer[1] === 254) {
    return buffer.toString('utf16le');
  }

  // utf8
  return buffer.toString();
}

module.exports = safeBufferRead;
