import { v7 as uuidv7 } from 'uuid';

/** Time-ordered UUIDv7: unique everywhere and usable as a sort key and cursor. */
export const newId = (): string => uuidv7();
