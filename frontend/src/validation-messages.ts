// The popup a browser shows when a form is submitted with a bad field comes in the browser's own
// language. The app is English only (#419), so the message is set here from the field's validity
// state (#462). `invalid` does not bubble, so one capture listener on the document covers every
// form; the custom message is cleared again as soon as the field changes, otherwise the field
// would stay invalid for good.
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function englishMessage(field: Field): string {
  const validity = field.validity;
  if (validity.valueMissing) {
    if (field instanceof HTMLSelectElement) return 'Choose an option';
    if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio'))
      return 'Check this box to continue';
    if (field instanceof HTMLInputElement && field.type === 'file') return 'Choose a file';
    return 'Fill in this field';
  }
  if (validity.typeMismatch || validity.patternMismatch) return 'Use the format asked for';
  if (validity.badInput) return 'Enter a valid value';
  if (validity.tooShort) return `Use at least ${(field as HTMLInputElement).minLength} characters`;
  if (validity.tooLong) return `Use at most ${(field as HTMLInputElement).maxLength} characters`;
  if (validity.rangeUnderflow) return `Use a value of ${(field as HTMLInputElement).min} or more`;
  if (validity.rangeOverflow) return `Use a value of ${(field as HTMLInputElement).max} or less`;
  if (validity.stepMismatch) return 'Enter a valid value';
  return field.validationMessage;
}

let installed = false;

export function installEnglishValidation(root: Document = document) {
  if (installed) return;
  installed = true;
  root.addEventListener(
    'invalid',
    (event) => {
      const field = event.target as Field;
      // A message a screen set itself (setCustomValidity) is already its own wording.
      if (field.validity.customError) return;
      field.setCustomValidity(englishMessage(field));
      // setCustomValidity makes the field invalid with that text; showing it needs the next
      // report, so ask for it once and let the clearing below run on the next change.
      field.dataset.englishValidity = 'true';
    },
    true,
  );
  const clear = (event: Event) => {
    const field = event.target as Field;
    if (field.dataset?.englishValidity !== 'true') return;
    delete field.dataset.englishValidity;
    field.setCustomValidity('');
  };
  root.addEventListener('input', clear, true);
  root.addEventListener('change', clear, true);
  // A value a screen fills in by code (no input event) would leave the old message on a field that
  // is fine now and block the form. Before each submit attempt (a click or Enter) every message
  // set here is dropped, so the browser checks the fields again and `invalid` sets what still applies.
  const reset = (event: Event) => {
    if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
    root.querySelectorAll<Field>('[data-english-validity]').forEach((field) => {
      delete field.dataset.englishValidity;
      field.setCustomValidity('');
    });
  };
  root.addEventListener('click', reset, true);
  root.addEventListener('keydown', reset, true);
}

installEnglishValidation();
