// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0
// "Proof and safety"). Synthetic fixtures shared by the EU-D HTTP probe
// (tests/browser/eu-detail-http-probe.mjs) and the EU-D browser spec
// (tests/browser/eu-detail.spec.mjs).
//
// Valid file structures only — a real PDF xref table and real PNG CRCs —
// ported from scripts/pipeline_smoke.py::synthetic_fixtures so the shapes
// match the repo's existing synthetic-evidence precedent. No real evidence,
// no case material, no identifying filenames.
//
// Requires Node >= 20.15 (zlib.crc32 landed in Node 20.15 / 22.2).

import { createHash } from "node:crypto";
import { deflateSync, crc32 } from "node:zlib";

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// Tagged template: builds a latin1 Buffer (byte-exact PDF syntax).
function b(strings, ...values) {
  let text = "";
  for (let i = 0; i < strings.length; i += 1) {
    text += strings[i];
    if (i < values.length) text += String(values[i]);
  }
  return Buffer.from(text, "latin1");
}

function pdfFixture() {
  const objects = [
    b`<< /Type /Catalog /Pages 2 0 R >>`,
    b`<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>`,
    b`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>`,
    b`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>`,
    b`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];
  for (const label of ["SYNTHETIC PDF PAGE ONE", "SYNTHETIC PDF PAGE TWO"]) {
    const stream = b`BT /F1 14 Tf 20 100 Td (${label}) Tj ET\n`;
    objects.push(
      Buffer.concat([
        b`<< /Length ${stream.length} >>\nstream\n`,
        stream,
        b`endstream`,
      ]),
    );
  }
  let out = b`%PDF-1.4\n%\xe2\xe3\xcf\xd3\n`;
  const offsets = [0];
  let number = 1;
  for (const obj of objects) {
    offsets.push(out.length);
    out = Buffer.concat([
      out,
      Buffer.from(`${number} 0 obj\n`, "latin1"),
      obj,
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    number += 1;
  }
  const xref = out.length;
  out = Buffer.concat([
    out,
    Buffer.from(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`, "latin1"),
  ]);
  for (const offset of offsets.slice(1)) {
    out = Buffer.concat([
      out,
      Buffer.from(`${String(offset).padStart(10, "0")} 00000 n \n`, "latin1"),
    ]);
  }
  out = Buffer.concat([
    out,
    Buffer.from(
      `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
      "latin1",
    ),
  ]);
  return out;
}

function pngChunk(kind, data) {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length, 0);
  const kindBuf = Buffer.from(kind, "latin1");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([kindBuf, data])) >>> 0, 0);
  return Buffer.concat([header, kindBuf, data, crcBuf]);
}

function pngFixture() {
  // 16x16 RGB checkerboard — deliberately not OCR-recognizable text.
  const rows = [];
  for (let y = 0; y < 16; y += 1) {
    const row = Buffer.alloc(1 + 16 * 3);
    for (let x = 0; x < 16; x += 1) {
      const v = 255 * ((Math.floor(x / 4) + Math.floor(y / 4)) % 2);
      row[1 + x * 3] = v;
      row[2 + x * 3] = v;
      row[3 + x * 3] = v;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(16, 0);
  ihdr.writeUInt32BE(16, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  const idat = deflateSync(Buffer.concat(rows));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function syntheticFixtures() {
  const pdf = pdfFixture();
  const png = pngFixture();
  const text = Buffer.from(
    "CASEVAULT SYNTHETIC FIXTURE\r\nNo case material.\nUTF-8: café — 123.\n",
    "utf8",
  );
  return {
    text: {
      filename: "eu-detail-synthetic.txt",
      contentType: "text/plain",
      content: text,
      sha256: sha256(text),
    },
    pdf: {
      filename: "eu-detail-synthetic.pdf",
      contentType: "application/pdf",
      content: pdf,
      sha256: sha256(pdf),
    },
    image: {
      filename: "eu-detail-synthetic.png",
      contentType: "image/png",
      content: png,
      sha256: sha256(png),
    },
  };
}
