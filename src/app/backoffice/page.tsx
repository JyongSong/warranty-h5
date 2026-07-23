import Link from "next/link";
import { getCurrentBackofficeUser } from "@/lib/login/backofficeAuth";

export default async function HomePage() {
  const user = await getCurrentBackofficeUser();
  const isLoggedIn = Boolean(user && user.level >= 1);

  return (
    <div className="min-h-screen">
      {/* Main Content Area */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <section className="py-20 text-center sm:py-28">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl max-w-4xl mx-auto leading-[1.15]">
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              AQARALIFE SERVICE BACKOFFICE
            </span>
          </h1>
          <p>사이드바 메뉴를 선택하세요.</p>
        </section>
      </main>
    </div>
  );
}
