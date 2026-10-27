import { UserForm } from "@/components/admin/UserForm";

export default function NewUserPage() {
  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-[24px] font-medium text-[var(--color-heading)]">
        Новый пользователь
      </h1>
      <UserForm mode="create" />
    </div>
  );
}