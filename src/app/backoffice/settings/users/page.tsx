import { redirect } from "next/navigation";
import { listBackofficeUsers } from "@/lib/backoffice/users";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import BackofficePageHeader from "../../BackofficePageHeader";
import {
  createBackofficeUserAction,
  deleteBackofficeUserAction,
  resetBackofficeUserPasswordAction,
  updateBackofficeUserAction,
  type BackofficeUserActionResult,
} from "./actions";
import { BackofficeUserCreateDialog } from "./BackofficeUserCreateDialog";
import { BackofficeUserLevelForm } from "./BackofficeUserLevelForm";
import { BackofficeUserPasswordResetForm } from "./BackofficeUserPasswordResetForm";
import { DeleteBackofficeUserForm } from "./DeleteBackofficeUserForm";

const BACKOFFICE_USERS_PATH = "/backoffice/settings/users";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(value);
}

function formatLastLogin(lastLoginAt: Date, createdAt: Date) {
  return lastLoginAt.getTime() === createdAt.getTime() ? "-" : formatDateTime(lastLoginAt);
}

export default async function BackofficeUsersPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const actionError = getBackofficeUserActionErrorMessage(
    getSingleSearchParam(resolvedSearchParams?.userActionError),
  );

  await requireBackofficeUserPage(BACKOFFICE_USERS_PATH, 1);
  const users = await listBackofficeUsers();

  async function createUser(formData: FormData) {
    "use server";
    handleBackofficeUserActionResult(await createBackofficeUserAction(formData));
  }

  async function updateUser(formData: FormData) {
    "use server";
    handleBackofficeUserActionResult(await updateBackofficeUserAction(formData));
  }

  async function resetUserPassword(formData: FormData) {
    "use server";
    handleBackofficeUserActionResult(await resetBackofficeUserPasswordAction(formData));
  }

  async function deleteUser(formData: FormData) {
    "use server";
    handleBackofficeUserActionResult(await deleteBackofficeUserAction(formData));
  }

  return (
    <div className="min-h-screen bg-white px-6 py-7 lg:px-8">
      <BackofficePageHeader title="유저 관리" />
      {actionError ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {actionError}
        </div>
      ) : null}

      <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">유저 목록</h2>
            <p className="mt-1 text-xs text-slate-500">가입 상태, 레벨, 최근 로그인 정보를 확인하고 관리합니다.</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-sm font-medium text-slate-500">총 {users.length}명</span>
            <BackofficeUserCreateDialog action={createUser} />
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full border-collapse text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/70 text-xs font-semibold text-slate-500">
              <tr>
                <th className="w-[28%] border-b border-slate-200 px-4 py-3">이메일</th>
                <th className="w-28 border-b border-slate-200 px-4 py-3">상태</th>
                <th className="w-44 border-b border-slate-200 px-4 py-3">레벨</th>
                <th className="w-44 border-b border-slate-200 px-4 py-3">최근 로그인</th>
                <th className="w-56 border-b border-slate-200 px-4 py-3">작업</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-600">
                    등록된 유저가 없습니다.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <td className="align-top px-4 py-3">
                      <span className="block min-w-56 py-2 text-sm font-medium text-slate-950">{user.email}</span>
                    </td>
                    <td className="align-top px-4 py-3">
                      <span
                        className={[
                          "inline-flex h-7 min-w-16 items-center justify-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
                          user.supabaseUserId
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700",
                        ].join(" ")}
                      >
                        {user.supabaseUserId ? "계정 생성" : "계정 미연결"}
                      </span>
                    </td>
                    <td className="align-top px-4 py-3">
                      <BackofficeUserLevelForm
                        action={updateUser}
                        user={{ id: user.id, email: user.email, level: user.level }}
                      />
                    </td>
                    <td className="align-top px-4 py-3 text-sm whitespace-nowrap text-slate-600">
                      {user.supabaseUserId ? formatLastLogin(user.lastLoginAt, user.createdAt) : "-"}
                    </td>
                    <td className="align-top px-4 py-3">
                      <div className="flex gap-2">
                        <BackofficeUserPasswordResetForm
                          action={resetUserPassword}
                          user={{ id: user.id, email: user.email }}
                          disabled={!user.supabaseUserId}
                        />
                        <DeleteBackofficeUserForm
                          action={deleteUser}
                          userEmail={user.email}
                          userId={user.id}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function handleBackofficeUserActionResult(result: BackofficeUserActionResult): never {
  if (!result.ok) {
    redirect(`${BACKOFFICE_USERS_PATH}?userActionError=${encodeURIComponent(result.error)}`);
  }

  redirect(BACKOFFICE_USERS_PATH);
}

function getSingleSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getBackofficeUserActionErrorMessage(error: string | undefined) {
  const messages: Record<string, string> = {
    EMAIL_REQUIRED: "이메일을 입력해 주세요.",
    EMAIL_INVALID: "올바른 이메일을 입력해 주세요.",
    FORBIDDEN: "유저 관리 권한이 없습니다.",
    LEVEL_INVALID: "레벨은 0 이상의 정수로 입력해 주세요.",
    PASSWORD_CONFIRMATION_MISMATCH: "비밀번호가 서로 일치하지 않습니다.",
    PASSWORD_REQUIRED: "비밀번호를 입력해 주세요.",
    SELF_DELETE_NOT_ALLOWED: "현재 로그인한 유저는 삭제할 수 없습니다.",
    SELF_LEVEL_DOWN_NOT_ALLOWED: "현재 로그인한 관리자의 권한은 대기로 변경할 수 없습니다.",
    UNAUTHORIZED: "로그인이 필요합니다.",
    USER_CREATE_FAILED: "유저 추가에 실패했습니다.",
    USER_AUTH_ACCOUNT_MISSING: "연결된 Supabase 계정이 없습니다.",
    USER_AUTH_CREATE_FAILED: "Supabase 로그인 계정 생성에 실패했습니다. 이메일 중복과 비밀번호 기준을 확인해 주세요.",
    USER_AUTH_DELETE_FAILED: "앱 접근은 차단했지만 Supabase 계정 삭제에 실패했습니다. 다시 시도해 주세요.",
    USER_DELETE_FAILED: "유저 삭제에 실패했습니다.",
    USER_ID_REQUIRED: "수정할 유저를 찾을 수 없습니다.",
    USER_NOT_FOUND: "유저를 찾을 수 없습니다.",
    USER_PASSWORD_RESET_FAILED: "관리자 비밀번호 재설정에 실패했습니다. 비밀번호 기준을 확인해 주세요.",
    USER_UPDATE_FAILED: "유저 수정에 실패했습니다.",
  };

  return error ? messages[error] ?? "유저 작업에 실패했습니다." : null;
}
