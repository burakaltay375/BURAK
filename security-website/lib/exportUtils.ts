/** Client-side Excel (SpreadsheetML .xls) and simple PDF exporters for admin panel. */

export type ExportCell = string | number | boolean | null | undefined;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cellText(value: ExportCell) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Excel-compatible SpreadsheetML (.xls) — opens natively in Microsoft Excel. */
export function downloadExcel(fileName: string, sheetName: string, headers: string[], rows: ExportCell[][]) {
  const safeSheet = escapeXml(sheetName.slice(0, 31) || "Sayfa1");
  const headerRow = `<Row>${headers
    .map((header) => `<Cell><Data ss:Type="String">${escapeXml(header)}</Data></Cell>`)
    .join("")}</Row>`;
  const bodyRows = rows
    .map(
      (row) =>
        `<Row>${headers
          .map((_, index) => {
            const raw = cellText(row[index]);
            const numeric = typeof row[index] === "number" && Number.isFinite(row[index] as number);
            return `<Cell><Data ss:Type="${numeric ? "Number" : "String"}">${escapeXml(raw)}</Data></Cell>`;
          })
          .join("")}</Row>`,
    )
    .join("");

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Worksheet ss:Name="${safeSheet}">
  <Table>
   ${headerRow}
   ${bodyRows}
  </Table>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([`\ufeff${xml}`], { type: "application/vnd.ms-excel;charset=utf-8" });
  const name = fileName.toLowerCase().endsWith(".xls") ? fileName : `${fileName}.xls`;
  triggerDownload(blob, name);
}

function pdfEscape(text: string) {
  return text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

/** Minimal multi-page text PDF without extra dependencies. */
export function downloadPdf(fileName: string, title: string, lines: string[]) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const lineHeight = 14;
  const maxLines = Math.floor((pageHeight - margin * 2) / lineHeight) - 2;
  const wrapped: string[] = [title, ""];

  for (const line of lines) {
    const chunks = String(line || "").match(/.{1,95}/g) || [""];
    wrapped.push(...chunks);
  }

  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += maxLines) {
    pages.push(wrapped.slice(i, i + maxLines));
  }
  if (!pages.length) pages.push([title]);

  const objects: string[] = [];
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  const pageObjectNumbers: number[] = [];
  let nextObject = 3;

  const pageContents: Array<{ pageObj: number; contentObj: number; stream: string }> = [];
  for (const pageLines of pages) {
    const pageObj = nextObject++;
    const contentObj = nextObject++;
    pageObjectNumbers.push(pageObj);
    const commands = [
      "BT /F1 11 Tf",
      `${margin} ${pageHeight - margin} Td`,
      `${lineHeight} TL`,
      ...pageLines.map((line, index) => `${index === 0 ? "" : "T* "}(${pdfEscape(line)}) Tj`),
      "ET",
    ].join("\n");
    pageContents.push({ pageObj, contentObj, stream: commands });
  }

  const kids = pageObjectNumbers.map((n) => `${n} 0 R`).join(" ");
  objects.push(`2 0 obj << /Type /Pages /Kids [${kids}] /Count ${pageObjectNumbers.length} >> endobj`);

  const fontObj = nextObject++;
  for (const page of pageContents) {
    objects.push(
      `${page.pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${page.contentObj} 0 R >> endobj`,
    );
    objects.push(`${page.contentObj} 0 obj << /Length ${page.stream.length} >> stream\n${page.stream}\nendstream endobj`);
  }
  objects.push(`${fontObj} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const blob = new Blob([pdf], { type: "application/pdf" });
  const name = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  triggerDownload(blob, name);
}
