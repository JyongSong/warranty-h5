import { redirect } from "next/navigation";
import { listBackofficeUsers } from "@/lib/backoffice/users";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import { BACKOFFICE_LEVEL, formatBackofficeLevel } from "@/lib/login/backofficeRoles";
import { formatBackofficePhone } from "@/lib/backoffice/table-formatting";
import BackofficePageHeader from "../../BackofficePageHeader";
import {
  createBackofficeUserAction,
  deleteBackofficeUserAction,
  resetBackofficeUserPasswordAction,
  updateBackofficeUserAction,
  type BackofficeUserActionResult,
} from "./actions";
import { BackofficeUserCreateDialog } from "./BackofficeUserCreateDialog";
import { BackofficeUserEditForm } from "./BackofficeUserEditForm";
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

  await requireBackofficeUserPage(BACKOFFICE_USERS_PATH, "settings");
  const allUsers = await listBackofficeUsers();
  // 회원가입으로 들어와 승인을 기다리는 유저. 로그인 계정이 있고 등급이 0 이다.
  const pendingUsers = allUsers.filter(
    (user) => user.level === BACKOFFICE_LEVEL.PENDING && user.supabaseUserId,
  );
  const users = allUsers.filter((user) => !pendingUsers.includes(user));

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

      {pendingUsers.length > 0 ? (
        <section className="mt-5 overflow-hidden rounded-lg border border-amber-200 bg-amber-50/40">
          <div className="border-b border-amber-200 px-4 py-4">
            <h2 className="text-sm font-semibold text-slate-950">승인 대기 {pendingUsers.length}명</h2>
            <p className="mt-1 text-xs text-slate-500">
              회원가입 페이지(/signup)로 가입 신청한 유저입니다. 이름과 등급을 정해 승인하거나 거절해 주세요.
            </p>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full border-collapse text-left text-sm whitespace-nowrap">
              <thead className="text-xs font-semibold text-slate-500">
                <tr>
                  <th className="border-b border-amber-200 px-4 py-3">이메일</th>
                  <th className="border-b border-amber-200 px-4 py-3">휴대폰</th>
                  <th className="border-b border-amber-200 px-4 py-3">신청일</th>
                  <th className="w-56 border-b border-amber-200 px-4 py-3">작업</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map((user) => (
                  <tr key={user.id} className="border-b border-amber-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-950">{user.email}</td>
                    <td className="px-4 py-3 text-slate-600">{formatBackofficePhone(user.phone)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <BackofficeUserEditForm
                          action={updateUser}
                          mode="approve"
                          user={{ id: user.id, email: user.email, name: user.name, level: user.level }}
                        />
                        <DeleteBackofficeUserForm
                          action={deleteUser}
                          userEmail={user.email}
                          userId={user.id}
                          mode="reject"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">유저 목록</h2>
            <p className="mt-1 text-xs text-slate-500">
              1 최고 관리자: 모든 권한 · 2 관리자: 설정 제외 조회·수정 · 3 사용자: 설정 제외 조회만
            </p>
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
                <th className="border-b border-slate-200 px-4 py-3">이름</th>
                <th className="w-[24%] border-b border-slate-200 px-4 py-3">이메일</th>
                <th className="border-b border-slate-200 px-4 py-3">휴대폰</th>
                <th className="w-28 border-b border-slate-200 px-4 py-3">상태</th>
                <th className="w-36 border-b border-slate-200 px-4 py-3">등급</th>
                <th className="w-44 border-b border-slate-200 px-4 py-3">최근 로그인</th>
                <th className="w-72 border-b border-slate-200 px-4 py-3">작업</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-600">
                    등록된 유저가 없습니다.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <td className="align-top px-4 py-3">
                      <span className="block py-2 text-sm font-medium text-slate-950">{user.name ?? "-"}</span>
                    </td>
                    <td className="align-top px-4 py-3">
                      <span className="block min-w-56 py-2 text-sm text-slate-700">{user.email}</span>
                    </td>
                    <td className="align-top px-4 py-3">
                      <span className="block py-2 text-sm text-slate-600">{formatBackofficePhone(user.phone)}</span>
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
                      <span className="block py-2 text-sm font-medium text-slate-950">
                        {user.level}. {formatBackofficeLevel(user.level)}
                      </span>
                    </td>
                    <td className="align-top px-4 py-3 text-sm whitespace-nowrap text-slate-600">
                      {user.supabaseUserId ? formatLastLogin(user.lastLoginAt, user.createdAt) : "-"}
                    </td>
                    <td className="align-top px-4 py-3">
                      <div className="flex gap-2">
                        <BackofficeUserEditForm
                          action={updateUser}
                          mode="edit"
                          user={{ id: user.id, email: user.email, name: user.name, level: user.level }}
                        />
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
    LEVEL_INVALID: "등급을 1(최고 관리자), 2(관리자), 3(사용자) 중에서 선택해 주세요.",
    NAME_TOO_LONG: "이름은 50자 이내로 입력해 주세요.",
    PASSWORD_CONFIRMATION_MISMATCH: "비밀번호가 서로 일치하지 않습니다.",
    PASSWORD_REQUIRED: "비밀번호를 입력해 주세요.",
    SELF_DELETE_NOT_ALLOWED: "현재 로그인한 유저는 삭제할 수 없습니다.",
    SELF_LEVEL_DOWN_NOT_ALLOWED: "본인의 최고 관리자 권한은 낮출 수 없습니다.",
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
