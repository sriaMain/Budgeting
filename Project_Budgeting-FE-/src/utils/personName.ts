/**
 * First / Middle / Last Name helpers for records whose single display name
 * (vendor `name`, freelancer `full_name`) is built from the three parts.
 */
export interface NameParts {
    first_name: string;
    middle_name: string;
    last_name: string;
}

/** "First Middle Last" - blank parts skipped. */
export const joinName = (...parts: (string | null | undefined)[]) =>
    parts.map((p) => (p || '').trim()).filter(Boolean).join(' ');

/**
 * The name parts to show in a form. Records saved before the name was split
 * have no parts yet, so their whole name starts in First Name.
 */
export const namePartsFrom = (
    record: Partial<NameParts>,
    fullName: string | null | undefined,
): NameParts =>
    record.first_name || record.middle_name || record.last_name
        ? { first_name: record.first_name || '', middle_name: record.middle_name || '', last_name: record.last_name || '' }
        : { first_name: fullName || '', middle_name: '', last_name: '' };
