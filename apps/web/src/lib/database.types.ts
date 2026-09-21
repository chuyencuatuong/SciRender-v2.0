/**
 * Hand-written row types for `supabase/migrations/20260921000000_schema_v1.sql`.
 *
 * Kept by hand (not `supabase gen types`) because the schema has two tables.
 * When it grows, replace this file with the generated one:
 *   npx supabase gen types typescript --project-id <id> > apps/web/src/lib/database.types.ts
 */
export type ProfileRole = 'student' | 'admin';

export interface ProfileRow {
  id: string;
  full_name: string | null;
  university: string;
  faculty: string | null;
  major: string | null;
  academic_year: string | null;
  student_id: string | null;
  birth_year: number | null;
  hometown: string | null;
  role: ProfileRole;
  auto_fill_cover: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Columns a signed-in user may write from the client. `id`, `role` and the
 * timestamps are deliberately absent: RLS already refuses a self-promotion to
 * admin, and the client never even sends the column.
 */
export type ProfileUpdate = Partial<
  Pick<
    ProfileRow,
    | 'full_name'
    | 'university'
    | 'faculty'
    | 'major'
    | 'academic_year'
    | 'student_id'
    | 'birth_year'
    | 'hometown'
    | 'auto_fill_cover'
  >
>;

export const PROFILE_WRITABLE_COLUMNS = [
  'full_name',
  'university',
  'faculty',
  'major',
  'academic_year',
  'student_id',
  'birth_year',
  'hometown',
  'auto_fill_cover',
] as const satisfies ReadonlyArray<keyof ProfileUpdate>;
