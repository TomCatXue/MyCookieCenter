// Generated from modules/youtube/src/ and assets/; run npm run build --workspace youtube.
(() => {
  const CONFIG_KEY = "YouTubeConfig";
  const QUALITY_KEY = "YouTubeQuality";
  function readConfig(key = CONFIG_KEY, limit = Infinity) {
    // I/O errors must propagate: a failed read is not an empty configuration.
    const stored = $persistentStore.read(key);
    if (typeof stored === "string" && stored.length > limit) return {};
    try {
      const value = JSON.parse(stored || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }
  function writeConfig(config, key = CONFIG_KEY) {
    return $persistentStore.write(JSON.stringify(config), key);
  }

  function concatBytes(chunks) {
    const result = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0));
    let offset = 0;
    for (const bytes of chunks) {
      result.set(bytes, offset);
      offset += bytes.length;
    }
    return result;
  }
  function sameBytes(a, b) {
    return a === b || (a.length === b.length && a.every((value, i) => value === b[i]));
  }
  function varint(value) {
    const bytes = [];
    do {
      bytes.push((value % 128) | (value > 127 ? 128 : 0));
      value = Math.floor(value / 128);
    } while (value);
    return new Uint8Array(bytes);
  }

  function wireFields(bytes) {
    const fields = [];
    let offset = 0;
    function read() {
      let value = 0,
        scale = 1;
      for (let i = 0; i < 5; i++) {
        if (offset >= bytes.length) throw new Error("Truncated protobuf varint");
        const byte = bytes[offset++];
        value += (byte & 127) * scale;
        if (!(byte & 128)) {
          if (value > 0xffffffff) throw new Error("Protobuf length/tag overflow");
          return value;
        }
        scale *= 128;
      }
      throw new Error("Invalid protobuf varint");
    }
    while (offset < bytes.length) {
      const start = offset,
        tag = read(),
        no = Math.floor(tag / 8),
        wire = tag % 8;
      if (!no) throw new Error("Invalid protobuf field");
      let payloadStart = offset;
      if (wire === 2) {
        const length = read();
        payloadStart = offset;
        offset += length;
      } else if (wire === 1) offset += 8;
      else if (wire === 5) offset += 4;
      else if (wire === 0) {
        let count = 0,
          byte;
        do {
          if (offset >= bytes.length || count++ === 10) throw new Error("Invalid protobuf integer");
          byte = bytes[offset++];
          if (count === 10 && byte > 1) throw new Error("Protobuf integer overflow");
        } while (byte & 128);
      } else throw new Error("Unsupported protobuf wire type " + wire);
      if (offset > bytes.length) throw new Error("Truncated protobuf field");
      fields.push({
        no,
        wire,
        data: bytes.subarray(payloadStart, offset),
        raw: bytes.subarray(start, offset),
      });
    }
    return fields;
  }

  function readInteger(bytes) {
    let value = 0,
      scale = 1;
    for (const byte of bytes) {
      value += (byte & 127) * scale;
      scale *= 128;
    }
    return value;
  }

  function readOptions(defaults = {}) {
    return { ...defaults, ...parseArguments() };
  }
  // $argument is a string in Surge (JSON), an object in Loon ($argument.xxx).
  function parseArguments() {
    if (typeof $argument === "string") {
      if (!$argument || $argument.includes("{{{")) return {};
      try {
        return coerceValues(JSON.parse($argument));
      } catch {
        return {};
      }
    }
    if ($argument && typeof $argument === "object") return coerceValues({ ...$argument });
    return {};
  }
  // Loon passes every value as a string; "false" must not stay truthy.
  function coerceValues(values) {
    const result = {};
    for (const [key, value] of Object.entries(values)) {
      if (typeof value !== "string") {
        result[key] = value;
        continue;
      }
      const text = value.trim().toLowerCase();
      if (text === "true") result[key] = true;
      else if (text === "false") result[key] = false;
      else if (text !== "" && !Number.isNaN(Number(text))) result[key] = Number(text);
      else result[key] = value;
    }
    return result;
  }

  function platformKey(request) {
    return Object.entries(request.headers ?? {}).some(
      ([name, value]) => name.toLowerCase() === "user-agent" && /music/i.test(value),
    )
      ? "youtubeMusic"
      : "youtube";
  }

  function keyCandidates(stored) {
    if (!stored) return [];
    return [stored, ...(Array.isArray(stored.previous) ? stored.previous.slice(0, 3) : [])].filter(
      (pair) =>
        pair &&
        typeof pair.clientKey === "string" &&
        typeof pair.encryptKey === "string" &&
        pair.clientKey.length > 0 &&
        pair.clientKey.length <= 5500 &&
        pair.encryptKey.length > 0 &&
        pair.encryptKey.length <= 5500,
    );
  }
  function clearKeys(platform, expected) {
    if (platform === undefined || expected === undefined) return;
    const config = readConfig();
    if (!Object.hasOwn(config, platform)) return;
    const current = config[platform];
    const snapshot = expected;
    if (JSON.stringify(current) === JSON.stringify(snapshot)) {
      delete config[platform];
      return writeConfig(config);
    }
  }

  function bytesField(bytes, number, unique = false) {
    let first;
    for (const field of wireFields(bytes)) {
      if (field.no !== number || field.wire !== 2) continue;
      if (!unique) return field.data;
      if (first) return;
      first = field.data;
    }
    return first;
  }

  function decodeBase64(value) {
    const normalized = value.replace(/[-_\s=]/g, (character) => (character === "-" ? "+" : character === "_" ? "/" : ""));
    // Preserve the existing decoder's ignored final six bits; validate that character too.
    const partial = normalized.length % 4 === 1;
    const bytes = Uint8Array.fromBase64(partial ? normalized + "A" : normalized);
    return partial ? bytes.subarray(0, -1) : bytes;
  }

  const QUALITY_LIMIT = 64 * 1024;
  function validQuality(value) {
    const record = value;
    return !!(
      record &&
      typeof record === "object" &&
      !Array.isArray(record) &&
      Number.isInteger(record.height) &&
      record.height > 0 &&
      record.height <= 0x7fffffff &&
      Array.isArray(record.itags) &&
      record.itags.length > 0 &&
      record.itags.length <= 256 &&
      record.itags.every((itag) => Number.isInteger(itag) && itag > 0 && itag <= 0xffffffff) &&
      new Set(record.itags).size === record.itags.length &&
      (record.premiumItags === undefined ||
        (Array.isArray(record.premiumItags) &&
          record.premiumItags.length <= record.itags.length &&
          new Set(record.premiumItags).size === record.premiumItags.length &&
          record.premiumItags.every((itag) => record.itags.includes(itag))))
    );
  }

  function setQuality(bytes, quality) {
    // A fresh manual selection plus sticky resolution prevents ABR downgrades.
    // Without a matching catalogue, retain the higher-quality preference.
    const values = new Map(
        quality
          ? [
              [13, 0],
              [14, 2],
              [16, quality.height],
              [21, quality.height],
              [26, 3],
              [30, 0],
            ]
          : [
              [16, 4320],
              [26, 1],
              [30, 0],
            ],
      ),
      seen = new Set(),
      chunks = [];
    let changed = false;
    for (const field of wireFields(bytes)) {
      const value = field.wire === 0 ? values.get(field.no) : undefined;
      if (value !== undefined) {
        if (readInteger(field.data) === value) chunks.push(field.raw);
        else {
          chunks.push(varint(field.no * 8), varint(value));
          changed = true;
        }
        seen.add(field.no);
      } else chunks.push(field.raw);
    }
    for (const [no, value] of values)
      if (!seen.has(no)) {
        chunks.push(varint(no * 8), varint(value));
        changed = true;
      }
    return changed ? concatBytes(chunks) : bytes;
  }
  function preferInitialQuality(bytes) {
    // OnesieRequest carries ClientAbrState at field 2, before initial media.
    // Keep the encrypted request and signed configuration byte-for-byte intact.
    const fields = wireFields(bytes);
    const states = fields.filter((field) => field.no === 2 && field.wire === 2);
    if (states.length !== 1) return bytes;
    const state = states[0];
    const output = setQuality(state.data, undefined);
    return output === state.data
      ? bytes
      : concatBytes(
          fields.map((field) => (field === state ? concatBytes([varint(18), varint(output.length), output]) : field.raw)),
        );
  }
  function selectQuality(fields, url) {
    try {
      const match = /[?&]id=([^&]+)/.exec(url);
      if (!match) return;
      const config = fields.find((field) => field.no === 5 && field.wire === 2);
      const signed = config && bytesField(config.data, 1);
      if (!signed?.length) return;
      const quality = readConfig(QUALITY_KEY, QUALITY_LIMIT)?.[decodeURIComponent(match[1])];
      if (!validQuality(quality)) return;
      // Copy complete IDs from this request's allowed list; never invent an
      // itag, timestamp, tag or authorization, nor modify the signed config.
      const formats = [],
        premium = [];
      for (const field of wireFields(signed)) {
        if (field.no !== 6 || field.wire !== 2) continue;
        const itag = wireFields(field.data).find((field) => field.no === 1 && field.wire === 0);
        if (!itag) continue;
        const id = readInteger(itag.data);
        if (!quality.itags.includes(id)) continue;
        formats.push(field.data);
        if (quality.premiumItags?.includes(id)) premium.push(field.data);
      }
      return formats.length
        ? {
            height: quality.height,
            formats: premium.length ? premium : formats,
          }
        : undefined;
    } catch {
      return undefined;
    }
  }
  function forceHighestQuality(bytes, url) {
    const fields = wireFields(bytes),
      quality = selectQuality(fields, url);
    const selected = fields.filter((field) => field.no === 17 && field.wire === 2);
    const replaceFormats =
      quality &&
      (selected.length !== quality.formats.length || selected.some((field, i) => !sameBytes(field.data, quality.formats[i])));
    const chunks = [];
    let found = false,
      changed = !!replaceFormats;
    for (const field of fields) {
      if (field.no === 1 && field.wire === 2) {
        const state = setQuality(field.data, quality);
        if (state === field.data) chunks.push(field.raw);
        else {
          chunks.push(varint(10), varint(state.length), state);
          changed = true;
        }
        found = true;
      } else if (replaceFormats && field.no === 17 && field.wire === 2) {
        continue;
      } else chunks.push(field.raw);
    }
    if (!found) {
      const state = setQuality(new Uint8Array(), quality);
      chunks.push(varint(10), varint(state.length), state);
      changed = true;
    }
    if (replaceFormats) for (const format of quality.formats) chunks.push(varint(17 * 8 + 2), varint(format.length), format);
    return changed ? concatBytes(chunks) : bytes;
  }

  function requestMain() {
    let path;
    try {
      path = $request.url.split("?")[0];
      let result;
      if (path.endsWith("/player/ad_break")) result = emptyPlayback();
      else if (path.endsWith("/log_event")) result = prepareLogEvent($request);
      else if (path.endsWith("/initplayback")) {
        // Redirect discovery uses bodyless GETs on the same endpoint.
        if ($request.method !== "GET" && $request.method !== "HEAD") {
          const body = binaryRequestBody($request);
          result = preparePlayback(body, platformKey($request));
          if (!result && body?.length && readOptions().autoHd !== false) {
            const output = preferInitialQuality(body);
            if (output !== body) result = { body: output };
          }
        }
      } else if (path.endsWith("/videoplayback")) {
        const options = readOptions();
        const body = options.autoHd === false ? undefined : binaryRequestBody($request);
        if (body?.length) {
          const output = forceHighestQuality(body, $request.url);
          if (output !== body) result = { body: output };
        }
      }
      $done(result ?? {});
    } catch (error) {
      console.log("YouTube request: " + error);
      if (path?.endsWith("/initplayback")) {
        $done(emptyPlayback());
      } else $done();
    }
  }
  function binaryRequestBody(request) {
    const body = request.body;
    // Native JSC byte views need not share the script's Uint8Array constructor.
    if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    if (body?.length) throw new Error("YouTube requires binary-body-mode for request bodies");
    const length = Object.entries(request.headers ?? {}).find(([name]) => name.toLowerCase() === "content-length")?.[1];
    if (Number(length) > 0) throw new Error("YouTube request body unavailable; requires-body must be enabled");
  }
  function emptyPlayback() {
    return {
      response: {
        status: 200,
        headers: { "Content-Type": "application/x-protobuf" },
        body: new Uint8Array(),
      },
    };
  }
  function prepareLogEvent(request) {
    const names = Object.keys(request.headers ?? {}).filter((name) => name.toLowerCase() === "x-youtube-hot-hash-data");
    if (!names.length || readConfig()[platformKey(request)]?.clientKey) return;
    const headers = { ...request.headers };
    for (const name of names) delete headers[name];
    return { headers };
  }
  function preparePlayback(body, platform) {
    if (body === undefined || body.length === 0) return;
    const expected = readConfig()[platform];
    const encrypted = bytesField(body, 3);
    const clientKey = encrypted && bytesField(encrypted, 5);
    if (!clientKey?.length) return emptyPlayback();
    for (const pair of keyCandidates(expected)) {
      try {
        if (sameBytes(clientKey, decodeBase64(pair.encryptKey))) return;
      } catch {
        // A malformed entry must not discard another in-flight key.
      }
    }
    clearKeys(platform, expected);
    return emptyPlayback();
  }

  requestMain();
})();
