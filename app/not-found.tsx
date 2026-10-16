import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#FAF9F5] px-6 text-center text-[#191A16]">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FCFF52] text-2xl font-black text-[#0A0A0A] shadow-md mb-6">
        404
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        Page Not Found
      </h1>
      <p className="mt-3 max-w-md text-sm text-[#73766D]">
        The page you are looking for doesn't exist or has been moved.
      </p>
      <div className="mt-8 flex items-center gap-4">
        <Link
          href="/"
          className="rounded-2xl bg-[#FCFF52] px-6 py-2.5 text-xs font-bold text-[#0A0A0A] hover:bg-[#E8EB3A] shadow-sm transition-all"
        >
          Return Home
        </Link>
        <Link
          href="/dashboard"
          className="rounded-2xl border border-[#EAE7DE] bg-white px-6 py-2.5 text-xs font-semibold text-[#191A16] hover:bg-[#F5F4EE] shadow-xs transition-all"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}

