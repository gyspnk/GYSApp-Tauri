// Real multi-page PDF bytes, without upstream network or a second PDF library.
export function documentBytes(pages = 48) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, index) => `${4 + index * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let page = 1; page <= pages; page++) {
    const content = `BT /F1 24 Tf 50 740 Td (Reading page ${page}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
