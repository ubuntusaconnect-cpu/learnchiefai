export const CAPS_SUBJECTS = [
  "Mathematics",
  "Mathematical Literacy",
  "English Home Language",
  "English First Additional Language",
  "Afrikaans",
  "Life Orientation",
  "Physical Sciences",
  "Life Sciences",
  "Geography",
  "History",
  "Accounting",
  "Business Studies",
  "Economics",
  "CAT",
  "IT",
  "Tourism",
  "Consumer Studies",
  "Hospitality Studies",
  "Civil Technology",
  "Electrical Technology",
  "Mechanical Technology",
  "Engineering Graphics & Design",
  "Agricultural Sciences",
];

export const GRADES = [8, 9, 10, 11, 12] as const;
export const TERMS = [1, 2, 3, 4] as const;

export function yearRange(): number[] {
  const now = new Date().getFullYear();
  const years: number[] = [];
  for (let y = now; y >= now - 15; y--) years.push(y);
  return years;
}
