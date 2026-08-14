/**
 * MIDI Render Worker — Offline FluidSynth WASM rendering in a Web Worker.
 *
 * Receives MIDI ArrayBuffer + soundfont ArrayBuffer, renders to Float32Array
 * stereo PCM, and transfers back to the main thread (zero-copy).
 *
 * Messages IN:
 *   { type: 'init' }                          — Wait for WASM ready
 *   { type: 'loadSoundFont', id, buffer }     — Cache SF2/SF3 ArrayBuffer
 *   { type: 'render', id, midiBuffer, sampleRate, transpose, instrument, tempoRate }
 *
 * Messages OUT:
 *   { type: 'ready' }
 *   { type: 'sfLoaded', id }
 *   { type: 'rendered', id, left, right, sampleRate, duration }
 *   { type: 'renderProgress', id, percent }
 *   { type: 'error', id, error }
 */

/* global JSSynth, importScripts */

// Suppress non-fatal WASM stub messages from FluidSynth's Emscripten layer
// (fluid_file_test, fluid_stat, etc. are POSIX stubs — loading still works fine)
// MUST run BEFORE importScripts so errors during WASM init are caught.
(function () {
  var _origWarn = console.warn.bind(console);
  var _origLog = console.log.bind(console);
  var _origErr = console.error.bind(console);
  var _STUB_RE = /fluid_file_test|fluid_stat|is a stub/;
  console.warn = function () {
    if (arguments.length > 0 && typeof arguments[0] === 'string' && _STUB_RE.test(arguments[0])) return;
    _origWarn.apply(console, arguments);
  };
  console.log = function () {
    if (arguments.length > 0 && typeof arguments[0] === 'string' && _STUB_RE.test(arguments[0])) return;
    _origLog.apply(console, arguments);
  };
  console.error = function () {
    if (arguments.length > 0 && typeof arguments[0] === 'string' && _STUB_RE.test(arguments[0])) return;
    _origErr.apply(console, arguments);
  };
}());

// Keep the complete synthesis path same-origin and offline-capable.  The
// worker is served from /vendor, so resolving relative URLs also works when
// Vite is mounted below a GitHub Pages project path.
importScripts(
  new URL('./js-synthesizer/libfluidsynth-2.4.6.js', self.location.href).href,
  new URL('./js-synthesizer/js-synthesizer.min.js', self.location.href).href
);

let _sfontBuffer = null;   // Cached soundfont ArrayBuffer
let _wasmReady = false;

JSSynth.waitForReady().then(function () {
  _wasmReady = true;
  self.postMessage({ type: 'ready' });
});

self.onmessage = function (e) {
  var msg = e.data;
  switch (msg.type) {
    case 'init':
      if (_wasmReady) self.postMessage({ type: 'ready' });
      break;

    case 'loadSoundFont':
      _sfontBuffer = msg.buffer;
      if (typeof JSSynth === 'undefined' || !_wasmReady) {
        self.postMessage({ type: 'sfLoaded', id: msg.id, debug: 'not_ready' });
        break;
      }
      try {
        var dummySynth = new JSSynth.Synthesizer();
        dummySynth.init(44100);
        dummySynth.loadSFont(_sfontBuffer.slice(0)).then(function(sfId) {
          var presetsMap = {};
          try {
            var sfObj = dummySynth.getSFontObject(sfId);
            for (var p of sfObj.getPresetIterable()) {
              if (p.num < 128 && (p.bankNum === 0 || !(p.num in presetsMap))) {
                presetsMap[p.num] = p.name;
              }
            }
          } catch (err) {}
          if (dummySynth.close) dummySynth.close();
          var presets = Object.keys(presetsMap).map(function(num) {
            return [parseInt(num, 10), presetsMap[num]];
          }).sort(function(a, b) { return a[0] - b[0]; });
          
          self.postMessage({ type: 'sfLoaded', id: msg.id, presets: presets });
        }).catch(function(e) {
          if (dummySynth && dummySynth.close) dummySynth.close();
          self.postMessage({ type: 'sfLoaded', id: msg.id, err: e.message || String(e) });
        });
      } catch (e) {
        self.postMessage({ type: 'sfLoaded', id: msg.id, err2: e.message || String(e) });
      }
      break;

    case 'render':
      renderMidi(msg).then(function (result) {
        // Transfer Float32Array buffers (zero-copy)
        self.postMessage(
          { type: 'rendered', id: msg.id, left: result.left, right: result.right,
            sampleRate: result.sampleRate, duration: result.duration },
          [result.left.buffer, result.right.buffer]
        );
      }).catch(function (err) {
        self.postMessage({ type: 'error', id: msg.id, error: err.message || String(err) });
      });
      break;
  }
};

function _readVarLen(data, offset, limit) {
  var value = 0;
  var pos = offset;
  var count = 0;
  while (pos < limit && count < 4) {
    var b = data[pos++];
    value = (value << 7) | (b & 0x7F);
    count += 1;
    if ((b & 0x80) === 0) {
      return { value: value, nextOffset: pos };
    }
  }
  return null;
}

function _readUint32BE(data, offset) {
  return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
}

function _scaleMidiTempo(midiBuffer, tempoRate) {
  var rate = Number(tempoRate);
  if (!Number.isFinite(rate) || rate <= 0 || Math.abs(rate - 1) < 0.000001) return midiBuffer;

  var input = new Uint8Array(midiBuffer);
  if (input.length < 14) return midiBuffer;

  // "MThd"
  if (input[0] !== 0x4D || input[1] !== 0x54 || input[2] !== 0x68 || input[3] !== 0x64) {
    return midiBuffer;
  }

  var headerLength = _readUint32BE(input, 4) >>> 0;
  if (headerLength < 6) return midiBuffer;

  var trackCount = ((input[10] << 8) | input[11]) >>> 0;
  var offset = 8 + headerLength;
  if (offset > input.length) return midiBuffer;

  var output = new Uint8Array(input);
  var tempoEventCount = 0;

  for (var trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    if (offset + 8 > input.length) break;

    // "MTrk"
    if (input[offset] !== 0x4D || input[offset + 1] !== 0x54 || input[offset + 2] !== 0x72 || input[offset + 3] !== 0x6B) {
      break;
    }

    var trackLength = _readUint32BE(input, offset + 4) >>> 0;
    var trackStart = offset + 8;
    var trackEnd = trackStart + trackLength;
    if (trackEnd > input.length) break;

    var pos = trackStart;
    var runningStatus = 0;

    while (pos < trackEnd) {
      var deltaInfo = _readVarLen(input, pos, trackEnd);
      if (!deltaInfo) break;
      pos = deltaInfo.nextOffset;
      if (pos >= trackEnd) break;

      var statusByte = input[pos];
      var usingRunningStatus = false;

      if (statusByte < 0x80) {
        if (runningStatus === 0) break;
        statusByte = runningStatus;
        usingRunningStatus = true;
      } else {
        pos += 1;
        if (statusByte < 0xF0) {
          runningStatus = statusByte;
        } else {
          runningStatus = 0;
        }
      }

      if (statusByte === 0xFF) {
        if (pos >= trackEnd) break;
        var metaType = input[pos++];
        var metaLenInfo = _readVarLen(input, pos, trackEnd);
        if (!metaLenInfo) break;
        var metaLength = metaLenInfo.value;
        pos = metaLenInfo.nextOffset;
        if (pos + metaLength > trackEnd) break;

        if (metaType === 0x51 && metaLength === 3) {
          var mpqn = (input[pos] << 16) | (input[pos + 1] << 8) | input[pos + 2];
          if (mpqn > 0) {
            var scaledMpqn = Math.round(mpqn / rate);
            if (scaledMpqn < 1) scaledMpqn = 1;
            if (scaledMpqn > 0xFFFFFF) scaledMpqn = 0xFFFFFF;
            output[pos] = (scaledMpqn >> 16) & 0xFF;
            output[pos + 1] = (scaledMpqn >> 8) & 0xFF;
            output[pos + 2] = scaledMpqn & 0xFF;
            tempoEventCount += 1;
          }
        }

        pos += metaLength;
        if (metaType === 0x2F) break;
        continue;
      }

      if (statusByte === 0xF0 || statusByte === 0xF7) {
        var sysexLenInfo = _readVarLen(input, pos, trackEnd);
        if (!sysexLenInfo) break;
        pos = sysexLenInfo.nextOffset + sysexLenInfo.value;
        if (pos > trackEnd) break;
        continue;
      }

      var dataLen = 0;
      if (statusByte >= 0xF0) {
        switch (statusByte) {
          case 0xF1:
          case 0xF3:
            dataLen = 1;
            break;
          case 0xF2:
            dataLen = 2;
            break;
          default:
            dataLen = 0;
            break;
        }
      } else {
        var statusClass = statusByte & 0xF0;
        dataLen = (statusClass === 0xC0 || statusClass === 0xD0) ? 1 : 2;
      }

      // When using running status, `pos` already points to the first data byte.
      // For explicit status bytes, `pos` also points to first data byte (after increment above).
      pos += dataLen;
      if (usingRunningStatus && dataLen === 0) {
        // Should not happen in standard MIDI channel events, but guard anyway.
        break;
      }
      if (pos > trackEnd) break;
    }

    offset = trackEnd;
  }

  if (tempoEventCount === 0) {
    // Keep source untouched when no explicit tempo events are present.
    return midiBuffer;
  }

  return output.buffer;
}

/**
 * Render a MIDI file to stereo Float32Array using FluidSynth.
 */
function renderMidi(msg) {
  return new Promise(function (resolve, reject) {
    if (!_sfontBuffer) { reject(new Error('No soundfont loaded')); return; }
    if (!_wasmReady) { reject(new Error('WASM not ready')); return; }

    var sampleRate = msg.sampleRate || 44100;
    // Clamp to FluidSynth valid range (8000-96000)
    sampleRate = Math.max(8000, Math.min(96000, sampleRate));
    var tempoRate = Number(msg.tempoRate);
    if (!Number.isFinite(tempoRate) || tempoRate <= 0) tempoRate = 1;
    var transpose = msg.transpose || 0;
    var instrument = (msg.instrument != null && msg.instrument >= 0) ? msg.instrument : -1;
    var midiData = (Math.abs(tempoRate - 1) > 0.0001)
      ? _scaleMidiTempo(msg.midiBuffer, tempoRate)
      : msg.midiBuffer;

    var synth = new JSSynth.Synthesizer();
    synth.init(sampleRate, {
      reverbActive: true,
      chorusActive: true,
      initialGain: 1.0,
      polyphony: 512
    });

    // Load soundfont — must copy buffer since it may be neutered
    var sfBuf = _sfontBuffer.slice(0);

    synth.loadSFont(sfBuf).then(function (sfId) {
      if (instrument >= 0) {
        for (var channel = 0; channel < 16; channel++) {
          if (channel === 9) continue;
          synth.midiProgramSelect(channel, sfId, 0, instrument);
        }
      }

      // Hook MIDI events for transpose and instrument override
      if (transpose !== 0 || instrument >= 0) {
        synth.hookPlayerMIDIEvents(function (_s, eventType, eventData) {
          var ch = eventData.getChannel();
          var isDrum = (ch === 9);

          // Note On
          if (eventType === 0x90 && !isDrum && transpose !== 0) {
            var key = eventData.getKey();
            eventData.setKey(Math.max(0, Math.min(127, key + transpose)));
          }
          // Note Off
          if (eventType === 0x80 && !isDrum && transpose !== 0) {
            var keyOff = eventData.getKey();
            eventData.setKey(Math.max(0, Math.min(127, keyOff + transpose)));
          }
          // Force the selected preset on live note events because many files
          // never emit usable program-change events during playback.
          if (!isDrum && instrument >= 0 && eventType === 0x90) {
            _s.midiProgramSelect(ch, sfId, 0, instrument);
          }
          return false; // Let FluidSynth process the (modified) event normally
        });
      }

      return synth.addSMFDataToPlayer(midiData);
    }).then(function () {
      return synth.playPlayer();
    }).then(function () {
      // Render in chunks
      var CHUNK = 8192;
      var chunks = [];
      var framesRendered = 0;

      // Render while player is active or voices are still sounding
      while (synth.isPlayerPlaying() || synth.isPlaying()) {
        var left = new Float32Array(CHUNK);
        var right = new Float32Array(CHUNK);
        synth.render([left, right]);
        chunks.push(left, right); // Store interleaved: [L0, R0, L1, R1, ...]
        framesRendered += CHUNK;
      }

      // Render extra tail for reverb/release decay (2 seconds)
      var tailFrames = Math.ceil(sampleRate * 2);
      var tailChunks = Math.ceil(tailFrames / CHUNK);
      for (var t = 0; t < tailChunks; t++) {
        var tl = new Float32Array(CHUNK);
        var tr = new Float32Array(CHUNK);
        synth.render([tl, tr]);
        chunks.push(tl, tr);
        framesRendered += CHUNK;
      }

      // Trim trailing silence (below -80dB ≈ 0.0001 amplitude)
      // Work backwards to find last audible sample
      var totalPairs = chunks.length / 2;
      var lastAudibleChunk = totalPairs - 1;
      var SILENCE_THRESHOLD = 0.0001;
      for (var ci = totalPairs - 1; ci >= 0; ci--) {
        var cl = chunks[ci * 2];
        var cr = chunks[ci * 2 + 1];
        var hasSound = false;
        for (var si = cl.length - 1; si >= 0; si--) {
          if (Math.abs(cl[si]) > SILENCE_THRESHOLD || Math.abs(cr[si]) > SILENCE_THRESHOLD) {
            hasSound = true;
            break;
          }
        }
        if (hasSound) {
          lastAudibleChunk = ci;
          break;
        }
      }

      // Concatenate chunks up to last audible + a small safety margin
      var usableChunks = Math.min(lastAudibleChunk + 2, totalPairs);
      var totalFrames = usableChunks * CHUNK;
      var leftAll = new Float32Array(totalFrames);
      var rightAll = new Float32Array(totalFrames);
      for (var i = 0; i < usableChunks; i++) {
        leftAll.set(chunks[i * 2], i * CHUNK);
        rightAll.set(chunks[i * 2 + 1], i * CHUNK);
      }

      // Normalisasi puncak ke headroom -0.5 dBFS (0.94):
      //  - Render yang pelan (velocity MIDI rendah) dinaikkan agar suara
      //    tidak terlalu pelan (boost maks 8x / ~18 dB).
      //  - Render yang terlalu keras diturunkan agar tidak peaking/clip.
      // Hasilnya level output konsisten dan aman untuk limiter live.
      var PEAK_TARGET = 0.94;
      var MAX_BOOST = 8;
      var peak = 0;
      for (var sampleIndex = 0; sampleIndex < totalFrames; sampleIndex++) {
        var leftPeak = Math.abs(leftAll[sampleIndex]);
        var rightPeak = Math.abs(rightAll[sampleIndex]);
        if (leftPeak > peak) peak = leftPeak;
        if (rightPeak > peak) peak = rightPeak;
      }
      if (peak > 0.0001) {
        var scale = PEAK_TARGET / peak;
        if (scale > MAX_BOOST) scale = MAX_BOOST;
        for (var normalizeIndex = 0; normalizeIndex < totalFrames; normalizeIndex++) {
          leftAll[normalizeIndex] *= scale;
          rightAll[normalizeIndex] *= scale;
        }
      }

      synth.close();

      resolve({
        left: leftAll,
        right: rightAll,
        sampleRate: sampleRate,
        duration: totalFrames / sampleRate
      });
    }).catch(function (err) {
      try { synth.close(); } catch (_e) {}
      reject(err);
    });
  });
}
