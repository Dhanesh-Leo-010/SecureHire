// Renders docs/sample-resumes/*.txt into PDFs (synthetic resumes for demo uploads).
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../docs/sample-resumes');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt'))) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  const doc = new PDFDocument({ size: 'A4', margin: 56 });
  doc.pipe(fs.createWriteStream(path.join(dir, f.replace('.txt', '.pdf'))));
  doc.fontSize(20).text(lines[0]); doc.fontSize(9).fillColor('#555').text(lines[1]).moveDown();
  const heads = /^(Summary|Professional Summary|Education|Experience|Work Experience|Skills|Projects|Certifications)$/;
  for (const l of lines.slice(2)) {
    if (heads.test(l.trim())) doc.moveDown(0.4).fillColor('#4F46E5').fontSize(12).text(l.trim()).fillColor('#111');
    else doc.fontSize(10).fillColor('#111').text(l);
  }
  doc.fontSize(7).fillColor('#999').text('\nSYNTHETIC SAMPLE RESUME — for SecureHire demo only.');
  doc.end();
}
console.log('sample PDFs written to', dir);
