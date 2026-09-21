import {
  CalendarDays,
  Check,
  GraduationCap,
  IdCard,
  Loader2,
  MapPin,
  Save,
  School,
  UserRound,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

export interface AcademicProfile {
  full_name: string;
  university: string;
  faculty: string;
  major: string;
  academic_year: string;
  student_id: string;
  birth_year: number | null;
  hometown: string;
  auto_fill_cover: boolean;
}

export interface ProfileSetupModalProps {
  open: boolean;
  initialProfile?: Partial<AcademicProfile>;
  onClose: () => void;
  onSave: (profile: AcademicProfile) => Promise<void> | void;
}

interface ProfileFormState {
  full_name: string;
  university: string;
  faculty: string;
  major: string;
  academic_year: string;
  student_id: string;
  birth_year: string;
  hometown: string;
  auto_fill_cover: boolean;
}

const DEFAULT_PROFILE: ProfileFormState = {
  full_name: '',
  university: 'Đại học Bách Khoa - ĐHQG-HCM',
  faculty: '',
  major: '',
  academic_year: '',
  student_id: '',
  birth_year: '',
  hometown: '',
  auto_fill_cover: true,
};

function toFormState(profile?: Partial<AcademicProfile>): ProfileFormState {
  return {
    full_name: profile?.full_name ?? DEFAULT_PROFILE.full_name,
    university: profile?.university ?? DEFAULT_PROFILE.university,
    faculty: profile?.faculty ?? DEFAULT_PROFILE.faculty,
    major: profile?.major ?? DEFAULT_PROFILE.major,
    academic_year: profile?.academic_year ?? DEFAULT_PROFILE.academic_year,
    student_id: profile?.student_id ?? DEFAULT_PROFILE.student_id,
    birth_year: profile?.birth_year == null ? '' : String(profile.birth_year),
    hometown: profile?.hometown ?? DEFAULT_PROFILE.hometown,
    auto_fill_cover: profile?.auto_fill_cover ?? DEFAULT_PROFILE.auto_fill_cover,
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Không thể lưu hồ sơ. Vui lòng thử lại.';
}

function Field({
  id,
  label,
  value,
  onChange,
  icon: Icon,
  type = 'text',
  required = false,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon: typeof UserRound;
  type?: 'text' | 'number';
  required?: boolean;
  inputMode?: 'numeric' | 'text';
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-300" htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-sky-400">*</span> : null}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          inputMode={inputMode}
          className="w-full rounded-xl border border-slate-800 bg-[#070b14] py-3 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/10"
        />
      </div>
    </div>
  );
}

export default function ProfileSetupModal({
  open,
  initialProfile,
  onClose,
  onSave,
}: ProfileSetupModalProps) {
  const [form, setForm] = useState<ProfileFormState>(() => toFormState(initialProfile));
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (open) {
      setForm(toFormState(initialProfile));
      setErrorMessage('');
      setIsSaving(false);
    }
  }, [initialProfile, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, onClose, open]);

  const isValidBirthYear = useMemo(() => {
    if (form.birth_year.trim() === '') {
      return true;
    }

    const year = Number(form.birth_year);
    const currentYear = new Date().getFullYear();
    return Number.isInteger(year) && year >= 1900 && year <= currentYear;
  }, [form.birth_year]);

  if (!open) {
    return null;
  }

  const setField = <K extends keyof ProfileFormState>(field: K, value: ProfileFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');

    if (!isValidBirthYear) {
      setErrorMessage('Năm sinh không hợp lệ. Hãy nhập năm từ 1900 đến năm hiện tại.');
      return;
    }

    setIsSaving(true);

    try {
      await onSave({
        full_name: form.full_name.trim(),
        university: form.university.trim(),
        faculty: form.faculty.trim(),
        major: form.major.trim(),
        academic_year: form.academic_year.trim(),
        student_id: form.student_id.trim(),
        birth_year: form.birth_year.trim() === '' ? null : Number(form.birth_year),
        hometown: form.hometown.trim(),
        auto_fill_cover: form.auto_fill_cover,
      });
    } catch (error: unknown) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="profile-setup-title"
        aria-modal="true"
        className="relative max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-800 bg-[#0d1424] shadow-2xl shadow-black/50"
        role="dialog"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38bdf8] to-transparent" />

        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
              <GraduationCap className="h-3.5 w-3.5" />
              Academic Profile
            </div>
            <h2 id="profile-setup-title" className="text-xl font-semibold tracking-tight text-slate-100">
              Hồ sơ học thuật
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
              Thông tin này được dùng để hoàn thiện Trang Bìa và các trường metadata khi bạn tạo tài liệu mới.
            </p>
          </div>

          <button
            type="button"
            disabled={isSaving}
            aria-label="Đóng hồ sơ học thuật"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form className="max-h-[calc(92vh-102px)] overflow-y-auto" onSubmit={handleSubmit}>
          <div className="grid gap-5 px-6 py-6 md:grid-cols-2">
            {errorMessage ? (
              <div className="md:col-span-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm leading-5 text-rose-300" role="alert">
                {errorMessage}
              </div>
            ) : null}

            <div className="md:col-span-2">
              <Field
                id="profile-full-name"
                label="Họ và tên"
                value={form.full_name}
                onChange={(value) => setField('full_name', value)}
                icon={UserRound}
                required
              />
            </div>

            <div className="md:col-span-2">
              <Field
                id="profile-university"
                label="Trường đại học"
                value={form.university}
                onChange={(value) => setField('university', value)}
                icon={School}
                required
              />
            </div>

            <Field
              id="profile-faculty"
              label="Khoa / Viện"
              value={form.faculty}
              onChange={(value) => setField('faculty', value)}
              icon={GraduationCap}
            />

            <Field
              id="profile-major"
              label="Ngành học"
              value={form.major}
              onChange={(value) => setField('major', value)}
              icon={GraduationCap}
            />

            <Field
              id="profile-academic-year"
              label="Khóa / Niên khóa"
              value={form.academic_year}
              onChange={(value) => setField('academic_year', value)}
              icon={CalendarDays}
            />

            <Field
              id="profile-student-id"
              label="MSSV"
              value={form.student_id}
              onChange={(value) => setField('student_id', value)}
              icon={IdCard}
            />

            <Field
              id="profile-birth-year"
              label="Năm sinh"
              value={form.birth_year}
              onChange={(value) => setField('birth_year', value.replace(/[^0-9]/g, '').slice(0, 4))}
              icon={CalendarDays}
              type="number"
              inputMode="numeric"
            />

            <Field
              id="profile-hometown"
              label="Quê quán"
              value={form.hometown}
              onChange={(value) => setField('hometown', value)}
              icon={MapPin}
            />

            <div className="md:col-span-2">
              <button
                type="button"
                role="switch"
                aria-checked={form.auto_fill_cover}
                onClick={() => setField('auto_fill_cover', !form.auto_fill_cover)}
                disabled={isSaving}
                className="flex w-full items-start gap-4 rounded-2xl border border-slate-800 bg-[#070b14] p-4 text-left transition hover:border-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span
                  className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition ${
                    form.auto_fill_cover ? 'bg-[#0052cc]' : 'bg-slate-800'
                  }`}
                  aria-hidden="true"
                >
                  <span
                    className={`h-4 w-4 rounded-full bg-white shadow transition ${
                      form.auto_fill_cover ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                    Tự động điền thông tin này vào Trang Bìa chuẩn Bách Khoa / IEEE khi tạo mới tài liệu
                    {form.auto_fill_cover ? <Check className="h-4 w-4 text-sky-400" /> : null}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Bạn vẫn có thể chỉnh sửa metadata riêng cho từng tài liệu sau khi tạo.
                  </span>
                </span>
              </button>
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-slate-800 bg-[#0d1424]/95 px-6 py-4 backdrop-blur">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-slate-500">
                Các trường có dấu <span className="text-sky-400">*</span> là bắt buộc.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={onClose}
                  className="rounded-xl border border-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-slate-700 hover:bg-slate-900 hover:text-white disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving || form.full_name.trim().length === 0 || form.university.trim().length === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0052cc] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#0052cc]/20 transition hover:bg-[#0b61dc] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Lưu hồ sơ
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
