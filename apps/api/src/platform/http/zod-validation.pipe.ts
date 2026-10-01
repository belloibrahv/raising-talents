import type { PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@rt/contracts';
import type { z } from 'zod';
import { ProblemException } from './problem.js';

/** Validates and normalises input against a schema from @rt/contracts. */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.infer<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw ProblemException.fromCode(ErrorCode.ValidationFailed, 'Some fields need attention', {
      fields: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }
}

export const body = <TSchema extends z.ZodType>(schema: TSchema) => new ZodValidationPipe(schema);
