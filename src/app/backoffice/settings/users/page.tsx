import { redirect } from "next/navigation";
import { listBackofficeUsers } from "@/lib/backoffice/users";
import { requireBackofficeUserPage } from "@/lib/login/backofficeAuth";
import BackofficePageHeader from "../../BackofficePageHeader";
import {
  createBackofficeUserAction,
  deleteBackofficeUserAction,
  updateBackofficeUserAction,
  type BackofficeUserActionResult,
} from "./actions";
import { BackofficeUserLevelForm } from "./BackofficeUserLevelForm";
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

export default async function BackofficeUsersPage({ searchParams }: PageProps = {}) {
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

  async function deleteUser(formData: FormData) {
    "use server";
    handleBackofficeUserActionResult(await deleteBackofficeUserAction(formData));
  }

  return (
    <div className="min-h-screen bg-white px-6 py-7 lg:px-8">
      <BackofficePageHeader title="유저 관리" meta={`총 ${users.length}명`} />
      {actionError ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {actionError}
        </div>
      ) : null}

      <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-slate-950">유저 추가</h2>
          <p className="mt-1 text-xs text-slate-500">초대할 이메일과 초기 레벨을 입력해 주세요.</p>
        </div>
        <form action={createUser} className="grid gap-4 md:grid-cols-[minmax(320px,560px)_120px_auto] md:gap-x-3">
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-slate-600">이메일</span>
            <input
              name="email"
              type="email"
              required
              placeholder="user@example.com"
              className="h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-semibold text-slate-600">레벨</span>
            <input
              name="level"
              type="number"
              min="0"
              step="1"
              required
              defaultValue="1"
              className="h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold whitespace-nowrap text-white transition hover:bg-slate-800"
            >
              유저 추가
            </button>
          </div>
        </form>
      </section>

      <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <h2 className="text-sm font-semibold text-slate-950">유저 목록</h2>
          <p className="mt-1 text-xs text-slate-500">가입 상태, 레벨, 최근 로그인 정보를 확인하고 관리합니다.</p>
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
                        {user.supabaseUserId ? "가입 완료" : "가입 전"}
                      </span>
                    </td>
                    <td className="align-top px-4 py-3">
                      <BackofficeUserLevelForm
                        action={updateUser}
                        user={{ id: user.id, email: user.email, level: user.level }}
                      />
                    </td>
                    <td className="align-top px-4 py-3 text-sm whitespace-nowrap text-slate-600">
                      {user.supabaseUserId ? formatDateTime(user.lastLoginAt) : "-"}
                    </td>
                    <td className="align-top px-4 py-3">
                      <div className="flex">
                        <DeleteBackofficeUserForm action={deleteUser} userEmail={user.email} userId={user.id} />
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
    SELF_DELETE_NOT_ALLOWED: "현재 로그인한 유저는 삭제할 수 없습니다.",
    SELF_LEVEL_DOWN_NOT_ALLOWED: "현재 로그인한 관리자의 권한은 대기로 변경할 수 없습니다.",
    UNAUTHORIZED: "로그인이 필요합니다.",
    USER_CREATE_FAILED: "유저 추가에 실패했습니다.",
    USER_DELETE_FAILED: "유저 삭제에 실패했습니다.",
    USER_ID_REQUIRED: "수정할 유저를 찾을 수 없습니다.",
    USER_UPDATE_FAILED: "유저 수정에 실패했습니다.",
  };

  return error ? messages[error] ?? "유저 작업에 실패했습니다." : null;
}
