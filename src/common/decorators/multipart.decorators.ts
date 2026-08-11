import { Transform } from 'class-transformer';

/**
 * Coercions for the endpoints the admin dashboard posts as
 * `multipart/form-data` (team, projects, services — anything with a file
 * upload). Everything in a multipart body arrives as text, so DTO fields typed
 * `boolean`, `string[]` or an object need help before `class-validator` sees
 * them.
 *
 * All of these read the raw value off `obj` rather than the `value` argument.
 * The global ValidationPipe runs with `enableImplicitConversion`, and
 * class-transformer applies that conversion *before* a `@Transform` callback —
 * so by the time these run, `value` has already been mangled (see the note on
 * `ToBoolean` for the ugliest case).
 */

/**
 * Implicit conversion coerces a `boolean` property with `Boolean(value)`,
 * which is `true` for *any* non-empty string — `"false"` included. An
 * unchecked checkbox therefore saved as `true` and the record could never be
 * hidden.
 */
export const ToBoolean = () =>
  Transform(({ obj, key }) => {
    const raw: unknown = obj?.[key];
    if (typeof raw === 'string') return raw === 'true' || raw === 'on';
    return raw;
  });

/**
 * A repeated multipart field only becomes an array once it appears twice —
 * `append-field` (used by multer) stores a lone occurrence as a bare string.
 * Without this, saving a project with exactly one feature, or a service with
 * one bullet point, fails `@IsArray()` with a 400.
 */
export const ToStringArray = () =>
  Transform(({ obj, key }) => {
    const raw: unknown = obj?.[key];
    if (raw === undefined || raw === null) return raw;
    return (Array.isArray(raw) ? raw : [raw]).map((item) => String(item));
  });

/**
 * Nested objects have no multipart representation, so the dashboard posts them
 * as a JSON string. Left alone they reach Mongoose as a string and are stored
 * verbatim in a Mixed field, which then fails to read back as an object.
 */
export const ToJsonObject = () =>
  Transform(({ obj, key }) => {
    const raw: unknown = obj?.[key];
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      // Leave the string in place; the field's validators reject it with a
      // useful message rather than this throwing a 500 out of the pipe.
      return raw;
    }
  });
