-- SciRender v2.0 — DAY 1 bổ sung cho schema_v1 (chạy SAU 20260921000000_schema_v1.sql)
--
-- 1. admin_document_count(): documents chỉ có policy "owner", nên admin đếm
--    bằng SELECT sẽ chỉ thấy tài liệu của chính mình. Hàm SECURITY DEFINER
--    này tự kiểm tra private.is_admin() rồi mới đếm toàn bảng; người không
--    phải admin nhận lỗi 42501 thay vì một con số.
-- 2. handle_new_user(): điền sẵn full_name từ metadata của Google/OAuth để
--    lần đăng nhập đầu tiên không bắt gõ lại tên.
--
-- Idempotent: chạy lại nhiều lần không sao.

begin;

create or replace function public.admin_document_count()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return (select count(*) from public.documents);
end;
$$;

revoke all on function public.admin_document_count() from public;
revoke all on function public.admin_document_count() from anon;
grant execute on function public.admin_document_count() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(
      left(
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
        200
      ),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

commit;
