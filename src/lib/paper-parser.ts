import { CAPS_SUBJECTS } from "./papers";

export type ParsedPaper = {
  grade: number | null;
  subject: string | null;
  term: number | null;
  year: number | null;
  isMemo: boolean;
  title: string;
};

// Aliases -> canonical CAPS_SUBJECTS entry
const SUBJECT_ALIASES: Array<[RegExp, string]> = [
  [/\bmath(ematic(s|al))?\s+lit(eracy)?\b/i, "Mathematical Literacy"],
  [/\bmath(s|ematics)?\b/i, "Mathematics"],
  [/\benglish\s+(home\s+language|hl)\b/i, "English Home Language"],
  [/\benglish\s+(first\s+additional\s+language|fal)\b/i, "English First Additional Language"],
  [/\benglish\b/i, "English Home Language"],
  [/\bafrikaans\b/i, "Afrikaans"],
  [/\blife\s+orientation\b|\blo\b/i, "Life Orientation"],
  [/\bphysical\s+sciences?\b|\bphys\s*sci\b|\bphysics\b/i, "Physical Sciences"],
  [/\blife\s+sciences?\b|\bbiology\b/i, "Life Sciences"],
  [/\bgeography\b|\bgeog\b/i, "Geography"],
  [/\bhistory\b/i, "History"],
  [/\baccounting\b/i, "Accounting"],
  [/\bbusiness\s+studies\b/i, "Business Studies"],
  [/\beconomics\b/i, "Economics"],
  [/\bcat\b|\bcomputer\s+applications?\s+technology\b/i, "CAT"],
  [/\bit\b|\binformation\s+technology\b/i, "IT"],
  [/\btourism\b/i, "Tourism"],
  [/\bconsumer\s+studies\b/i, "Consumer Studies"],
  [/\bhospitality\s+studies\b/i, "Hospitality Studies"],
  [/\bcivil\s+technology\b/i, "Civil Technology"],
  [/\belectrical\s+technology\b/i, "Electrical Technology"],
  [/\bmechanical\s+technology\b/i, "Mechanical Technology"],
  [/\begd\b|\bengineering\s+graphics\b/i, "Engineering Graphics & Design"],
  [/\bagricultural\s+sciences?\b|\bagric\b/i, "Agricultural Sciences"],
];

export function parseFilename(filename: string): ParsedPaper {
  const raw = filename.replace(/\.[^.]+$/, "");
  const normalized = raw.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

  const gradeMatch = normalized.match(/\bgr(?:ade)?\s*(\d{1,2})\b/i) || normalized.match(/\bg(\d{1,2})\b/i);
  let grade: number | null = gradeMatch ? parseInt(gradeMatch[1], 10) : null;
  if (grade !== null && (grade < 8 || grade > 12)) grade = null;

  const termMatch = normalized.match(/\bterm\s*([1-4])\b/i) || normalized.match(/\bt([1-4])\b/i);
  const term = termMatch ? parseInt(termMatch[1], 10) : null;

  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

  const isMemo = /\b(memo(randum)?|marking\s*guide(line)?s?|answers?|solutions?)\b/i.test(normalized);

  let subject: string | null = null;
  for (const [re, canonical] of SUBJECT_ALIASES) {
    if (re.test(normalized)) {
      // only accept if canonical exists in list
      if (CAPS_SUBJECTS.includes(canonical)) { subject = canonical; break; }
    }
  }

  return { grade, subject, term, year, isMemo, title: normalized };
}

export function buildTitle(p: { grade: number; subject: string; term: number; year: number; isMemo: boolean }): string {
  return `Grade ${p.grade} ${p.subject} Term ${p.term} ${p.year}${p.isMemo ? " (Memo)" : ""}`;
}
