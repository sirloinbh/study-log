import { type ComponentProps, useId } from 'react';

import { DateField, TimeField } from './components/ui/date-field';
import { cn } from './lib/utils';

// English date and time fields with the text above them (#447). The browser's own date and time
// inputs show its language ("연도 / 월 / 일") whatever `lang` says, so the screens use the kit's
// DateField and TimeField. The text is a <label for> beside the field, not around it: a label that
// wraps the field would add the calendar button's name to the field's name. `onChange` takes the
// same `{ target: { value } }` shape an input's does, so the screens' handlers did not change.
type Change = (event: { target: { value: string } }) => void;
type Shared = { text: string; className?: string; onChange: Change };

export function DateInput({
  text,
  className,
  onChange,
  ...props
}: Shared & Omit<ComponentProps<typeof DateField>, 'label' | 'onValueChange' | 'className'>) {
  const generated = useId();
  const id = props.id ?? generated;
  return (
    <div className={cn('picker-field picker-date', className)}>
      <label htmlFor={id}>{text}</label>
      <DateField
        {...props}
        id={id}
        label={text}
        onValueChange={(value) => onChange({ target: { value } })}
      />
    </div>
  );
}

export function TimeInput({
  text,
  className,
  onChange,
  ...props
}: Shared & Omit<ComponentProps<typeof TimeField>, 'label' | 'onValueChange' | 'className'>) {
  const generated = useId();
  const id = props.id ?? generated;
  return (
    <div className={cn('picker-field', className)}>
      <label htmlFor={id}>{text}</label>
      <TimeField
        {...props}
        id={id}
        label={text}
        onValueChange={(value) => onChange({ target: { value } })}
      />
    </div>
  );
}
