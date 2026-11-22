// "1 day", "2 days": a count with its noun in the right number. A noun with an irregular plural
// passes it as the third argument.
export const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;
